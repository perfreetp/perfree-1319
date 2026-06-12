import { getDb } from '../../database';
import { createError } from '../../middleware/errorHandler';

type PumpStatus = 'running' | 'standby' | 'maintenance';
type RequestStatus = 'pending' | 'approved' | 'rejected';
type RequestType = 'start' | 'stop';

interface Station {
  id: number;
  name: string;
  location: string | null;
  capacity: number | null;
}

interface PumpGroup {
  id: number;
  station_id: number;
  name: string;
  status: PumpStatus;
  current_flow: number;
  power: number;
  efficiency: number;
  station_name?: string;
}

interface PumpControl {
  id: number;
  pump_id: number;
  flow_rate: number;
  pressure: number;
  power: number;
  timestamp: string;
}

interface PumpRequest {
  id: number;
  pump_id: number;
  request_type: RequestType;
  reason: string | null;
  requester: string;
  approver: string | null;
  approval_opinion: string | null;
  status: RequestStatus;
  created_at: string;
  approved_at: string | null;
  pump_name?: string;
  station_name?: string;
}

export const getStations = (): Station[] => {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM pump_stations ORDER BY id');
  return stmt.all() as Station[];
};

export const getPumpList = (stationId?: number): PumpGroup[] => {
  const db = getDb();
  let sql = `
    SELECT pg.*, ps.name as station_name
    FROM pump_groups pg
    LEFT JOIN pump_stations ps ON pg.station_id = ps.id
  `;
  const params: (number | string)[] = [];

  if (stationId !== undefined) {
    sql += ' WHERE pg.station_id = ?';
    params.push(stationId);
  }

  sql += ' ORDER BY pg.id';
  const stmt = db.prepare(sql);
  return stmt.all(...params) as PumpGroup[];
};

export const getPumpDetail = (pumpId: number): PumpGroup => {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT pg.*, ps.name as station_name
    FROM pump_groups pg
    LEFT JOIN pump_stations ps ON pg.station_id = ps.id
    WHERE pg.id = ?
  `);
  const pump = stmt.get(pumpId) as PumpGroup;

  if (!pump) {
    throw createError(404, '泵组不存在');
  }

  return pump;
};

export const getPumpHistory = (pumpId: number, startTime?: string, endTime?: string): PumpControl[] => {
  const db = getDb();

  const pumpStmt = db.prepare('SELECT id FROM pump_groups WHERE id = ?');
  const pump = pumpStmt.get(pumpId);
  if (!pump) {
    throw createError(404, '泵组不存在');
  }

  let sql = 'SELECT * FROM pump_controls WHERE pump_id = ?';
  const params: (number | string)[] = [pumpId];

  if (startTime) {
    sql += ' AND timestamp >= ?';
    params.push(startTime);
  }
  if (endTime) {
    sql += ' AND timestamp <= ?';
    params.push(endTime);
  }

  sql += ' ORDER BY timestamp DESC LIMIT 1000';
  const stmt = db.prepare(sql);
  return stmt.all(...params) as PumpControl[];
};

export const createPumpRequest = (
  pumpId: number,
  requestType: RequestType,
  reason: string | undefined,
  requester: string
): number => {
  const db = getDb();

  const pumpStmt = db.prepare('SELECT id, status FROM pump_groups WHERE id = ?');
  const pump = pumpStmt.get(pumpId) as PumpGroup;
  if (!pump) {
    throw createError(404, '泵组不存在');
  }

  if (requestType === 'start' && pump.status === 'running') {
    throw createError(400, '泵组已在运行中');
  }
  if (requestType === 'stop' && pump.status === 'standby') {
    throw createError(400, '泵组已处于待机状态');
  }
  if (pump.status === 'maintenance') {
    throw createError(400, '泵组处于维护状态，无法操作');
  }

  const pendingStmt = db.prepare(`
    SELECT id FROM pump_requests
    WHERE pump_id = ? AND status = 'pending'
  `);
  const pending = pendingStmt.get(pumpId);
  if (pending) {
    throw createError(400, '该泵组已有待审批的申请');
  }

  const insertStmt = db.prepare(`
    INSERT INTO pump_requests (pump_id, request_type, reason, requester, status)
    VALUES (?, ?, ?, ?, 'pending')
  `);
  const result = insertStmt.run(pumpId, requestType, reason || null, requester);
  return result.lastInsertRowid as number;
};

export const getPumpRequests = (status?: RequestStatus): PumpRequest[] => {
  const db = getDb();
  let sql = `
    SELECT pr.*, pg.name as pump_name, ps.name as station_name
    FROM pump_requests pr
    LEFT JOIN pump_groups pg ON pr.pump_id = pg.id
    LEFT JOIN pump_stations ps ON pg.station_id = ps.id
  `;
  const params: (number | string)[] = [];

  if (status) {
    sql += ' WHERE pr.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY pr.created_at DESC';
  const stmt = db.prepare(sql);
  return stmt.all(...params) as PumpRequest[];
};

export const approvePumpRequest = (
  requestId: number,
  approver: string,
  opinion: string | undefined,
  approved: boolean
): void => {
  const db = getDb();

  const requestStmt = db.prepare('SELECT * FROM pump_requests WHERE id = ?');
  const request = requestStmt.get(requestId) as PumpRequest;
  if (!request) {
    throw createError(404, '申请不存在');
  }

  if (request.status !== 'pending') {
    throw createError(400, '该申请已处理，无法重复审批');
  }

  const newStatus: RequestStatus = approved ? 'approved' : 'rejected';

  const updateRequestStmt = db.prepare(`
    UPDATE pump_requests
    SET status = ?, approver = ?, approval_opinion = ?, approved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  if (approved) {
    const pumpStmt = db.prepare('SELECT id, status FROM pump_groups WHERE id = ?');
    const pump = pumpStmt.get(request.pump_id) as PumpGroup;
    if (!pump) {
      throw createError(404, '泵组不存在');
    }

    if (pump.status === 'maintenance') {
      throw createError(400, '泵组处于维护状态，无法操作');
    }

    const targetStatus: PumpStatus = request.request_type === 'start' ? 'running' : 'standby';

    const updatePumpStmt = db.prepare(`
      UPDATE pump_groups
      SET status = ?, current_flow = ?, power = ?
      WHERE id = ?
    `);

    const transaction = db.transaction(() => {
      updateRequestStmt.run(newStatus, approver, opinion || null, requestId);
      const flow = request.request_type === 'start' ? 100 : 0;
      const power = request.request_type === 'start' ? 50 : 0;
      updatePumpStmt.run(targetStatus, flow, power, request.pump_id);
    });

    transaction();
  } else {
    updateRequestStmt.run(newStatus, approver, opinion || null, requestId);
  }
};

export const addPumpControlRecord = (
  pumpId: number,
  flowRate: number,
  pressure: number,
  power: number
): number => {
  const db = getDb();

  const pumpStmt = db.prepare('SELECT id, status FROM pump_groups WHERE id = ?');
  const pump = pumpStmt.get(pumpId) as PumpGroup;
  if (!pump) {
    throw createError(404, '泵组不存在');
  }

  const transaction = db.transaction(() => {
    const insertStmt = db.prepare(`
      INSERT INTO pump_controls (pump_id, flow_rate, pressure, power)
      VALUES (?, ?, ?, ?)
    `);
    const result = insertStmt.run(pumpId, flowRate, pressure, power);

    const updateStmt = db.prepare(`
      UPDATE pump_groups
      SET current_flow = ?, power = ?
      WHERE id = ?
    `);
    updateStmt.run(flowRate, power, pumpId);

    return result.lastInsertRowid;
  });

  return transaction() as number;
};
