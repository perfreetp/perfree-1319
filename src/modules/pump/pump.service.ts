import { getDb } from '../../database';
import { createError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

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

interface PumpAuditLog {
  id: number;
  pump_id: number;
  request_id: number | null;
  action: string;
  old_status: string | null;
  new_status: string | null;
  operator: string;
  remark: string | null;
  created_at: string;
}

interface LastStatusChange {
  change_type: 'approval' | 'manual_control' | 'system';
  source_id: number | null;
  source_title: string | null;
  operator: string | null;
  from_status: string | null;
  to_status: string | null;
  changed_at: string | null;
  remark: string | null;
}

const addAuditLog = (pumpId: number, action: string, operator: string, oldStatus?: string, newStatus?: string, requestId?: number, remark?: string): void => {
  const db = getDb();
  db.prepare(`
    INSERT INTO pump_audit_logs (pump_id, request_id, action, old_status, new_status, operator, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(pumpId, requestId || null, action, oldStatus || null, newStatus || null, operator, remark || null);
};

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

export const getPumpDetail = (pumpId: number) => {
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

  const recentRequestsStmt = db.prepare(`
    SELECT pr.id, pr.request_type, pr.reason, pr.requester, pr.approver, pr.approval_opinion, pr.status, pr.created_at, pr.approved_at
    FROM pump_requests pr
    WHERE pr.pump_id = ?
    ORDER BY pr.created_at DESC
    LIMIT 5
  `);
  const recent_requests = recentRequestsStmt.all(pumpId);

  const lastAuditStmt = db.prepare(`
    SELECT * FROM pump_audit_logs
    WHERE pump_id = ?
    ORDER BY id DESC
    LIMIT 1
  `);
  const lastAudit = lastAuditStmt.get(pumpId) as PumpAuditLog | undefined;

  let last_status_change: LastStatusChange | null = null;
  if (lastAudit) {
    const isApproval = lastAudit.action.startsWith('审批');
    let sourceTitle: string | null = null;
    if (isApproval && lastAudit.request_id) {
      const req = db.prepare('SELECT request_type, reason FROM pump_requests WHERE id = ?').get(lastAudit.request_id) as any;
      if (req) {
        sourceTitle = `${req.request_type === 'start' ? '启动' : '停机'}申请${req.reason ? ' - ' + req.reason : ''}`;
      }
    }
    last_status_change = {
      change_type: isApproval ? 'approval' : 'manual_control',
      source_id: lastAudit.request_id,
      source_title: sourceTitle || lastAudit.action,
      operator: lastAudit.operator,
      from_status: lastAudit.old_status,
      to_status: lastAudit.new_status,
      changed_at: lastAudit.created_at,
      remark: lastAudit.remark
    };
  }

  return {
    ...pump,
    recent_requests,
    last_status_change
  };
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

  const transaction = db.transaction(() => {
    const insertStmt = db.prepare(`
      INSERT INTO pump_requests (pump_id, request_type, reason, requester, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);
    const result = insertStmt.run(pumpId, requestType, reason || null, requester);
    const requestId = result.lastInsertRowid as number;

    addAuditLog(pumpId, `提交${requestType === 'start' ? '启动' : '停机'}申请`, requester, pump.status, pump.status, requestId, reason);

    return requestId;
  });

  return transaction();
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

  const pumpStmt = db.prepare('SELECT id, status FROM pump_groups WHERE id = ?');
  const pump = pumpStmt.get(request.pump_id) as PumpGroup;
  if (!pump) {
    throw createError(404, '泵组不存在');
  }

  const newStatus: RequestStatus = approved ? 'approved' : 'rejected';

  const updateRequestStmt = db.prepare(`
    UPDATE pump_requests
    SET status = ?, approver = ?, approval_opinion = ?, approved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  if (approved) {
    if (pump.status === 'maintenance') {
      throw createError(400, '泵组处于维护状态，无法操作');
    }

    const targetStatus: PumpStatus = request.request_type === 'start' ? 'running' : 'standby';

    const updatePumpStmt = db.prepare(`
      UPDATE pump_groups
      SET status = ?, current_flow = ?, power = ?
      WHERE id = ?
    `);

    const insertControlStmt = db.prepare(`
      INSERT INTO pump_controls (pump_id, flow_rate, pressure, power, request_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      updateRequestStmt.run(newStatus, approver, opinion || null, requestId);
      const flow = request.request_type === 'start' ? 100 : 0;
      const power = request.request_type === 'start' ? 50 : 0;
      const pressure = request.request_type === 'start' ? 0.35 : 0.1;
      updatePumpStmt.run(targetStatus, flow, power, request.pump_id);
      insertControlStmt.run(request.pump_id, flow, pressure, power, requestId);

      addAuditLog(
        request.pump_id,
        `审批通过：${request.request_type === 'start' ? '启动' : '停机'}`,
        approver,
        pump.status,
        targetStatus,
        requestId,
        opinion
      );
    });

    transaction();
  } else {
    updateRequestStmt.run(newStatus, approver, opinion || null, requestId);

    addAuditLog(
      request.pump_id,
      `审批驳回：${request.request_type === 'start' ? '启动' : '停机'}`,
      approver,
      pump.status,
      pump.status,
      requestId,
      opinion
    );
  }
};

export const addPumpControlRecord = (
  pumpId: number,
  flowRate: number,
  pressure: number,
  power: number,
  requestId?: number,
  operator?: string
): number => {
  const db = getDb();

  const pumpStmt = db.prepare('SELECT id, status FROM pump_groups WHERE id = ?');
  const pump = pumpStmt.get(pumpId) as PumpGroup;
  if (!pump) {
    throw createError(404, '泵组不存在');
  }

  const transaction = db.transaction(() => {
    const insertStmt = db.prepare(`
      INSERT INTO pump_controls (pump_id, flow_rate, pressure, power, request_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = insertStmt.run(pumpId, flowRate, pressure, power, requestId || null);

    const updateStmt = db.prepare(`
      UPDATE pump_groups
      SET current_flow = ?, power = ?
      WHERE id = ?
    `);
    updateStmt.run(flowRate, power, pumpId);

    if (operator) {
      addAuditLog(
        pumpId,
        '手动运行数据采集',
        operator,
        pump.status,
        pump.status,
        requestId,
        `流量=${flowRate},压力=${pressure},功率=${power}`
      );
    }

    return result.lastInsertRowid;
  });

  return transaction() as number;
};

export const getPumpAuditLogs = (pumpId: number, limit: number = 20): PumpAuditLog[] => {
  const db = getDb();

  const pumpStmt = db.prepare('SELECT id FROM pump_groups WHERE id = ?');
  const pump = pumpStmt.get(pumpId);
  if (!pump) {
    throw createError(404, '泵组不存在');
  }

  const stmt = db.prepare(`
    SELECT * FROM pump_audit_logs
    WHERE pump_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(pumpId, limit) as PumpAuditLog[];
};
