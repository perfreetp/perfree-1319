import { getDb } from '../../database';
import { createError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

type CallType = 'complaint' | 'consultation' | 'report' | 'emergency';
type CallTag = '停水' | '水质' | '水压' | '漏水' | '抄表' | '其他';
type ShiftType = 'day' | 'night';
type EventType = 'burst' | 'outage';
type EventSeverity = 'low' | 'medium' | 'high' | 'critical';
type EventStatus = 'reported' | 'analyzing' | 'repairing' | 'completed' | 'cancelled';
type PumpStatus = 'running' | 'standby' | 'maintenance';

export type CustomerCallData = {
  caller_phone?: string;
  call_type: CallType;
  tags?: CallTag[];
  event_id?: number;
  operator: string;
  description?: string;
};

type CustomerCall = {
  id: number;
  caller_phone: string | null;
  call_type: CallType;
  tags: string | null;
  event_id: number | null;
  operator: string | null;
  description: string | null;
  created_at: string;
  event_type?: string;
  event_severity?: string;
  event_status?: string;
};

type TimelineEvent = {
  id: number;
  event_id: number;
  action: string;
  operator: string | null;
  remark: string | null;
  created_at: string;
  event_type?: string;
  event_severity?: string;
  event_location?: string;
};

type ShiftRecord = {
  id: number;
  shift_type: ShiftType;
  operator: string;
  start_time: string;
  end_time: string | null;
  handover_summary: string | null;
  created_at: string;
  event_count?: number;
  call_count?: number;
};

type DisposalStat = {
  event_type: EventType;
  severity: EventSeverity;
  count: number;
  avg_duration: number;
  max_duration: number;
  min_duration: number;
};

type DashboardStats = {
  today_event_count: number;
  ongoing_event_count: number;
  today_avg_disposal_time: number;
  pump_status: {
    running: number;
    standby: number;
    maintenance: number;
  };
  abnormal_pressure_zones: number;
};

const getCurrentShiftType = (): ShiftType => {
  const hour = new Date().getHours();
  return hour >= 8 && hour < 20 ? 'day' : 'night';
};

const formatDateForSql = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

export const createCustomerCall = (callData: CustomerCallData): number => {
  const db = getDb();

  if (callData.event_id) {
    const eventStmt = db.prepare(`SELECT id FROM pipe_events WHERE id = ?`);
    const event = eventStmt.get(callData.event_id);
    if (!event) {
      throw createError(404, `关联事件 ${callData.event_id} 不存在`);
    }
  }

  const tagsStr = callData.tags && callData.tags.length > 0 ? callData.tags.join(',') : null;

  const stmt = db.prepare(`
    INSERT INTO customer_calls (caller_phone, call_type, tags, event_id, operator, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    callData.caller_phone || null,
    callData.call_type,
    tagsStr,
    callData.event_id || null,
    callData.operator,
    callData.description || null
  );

  const callId = result.lastInsertRowid as number;

  logger.info(`用户来电记录创建成功，来电ID: ${callId}, 类型: ${callData.call_type}`);

  return callId;
};

export const getCustomerCalls = (tags?: string, startTime?: string, endTime?: string): CustomerCall[] => {
  const db = getDb();

  let sql = `
    SELECT cc.*, pe.event_type, pe.severity as event_severity, pe.status as event_status
    FROM customer_calls cc
    LEFT JOIN pipe_events pe ON cc.event_id = pe.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (tags) {
    sql += ' AND cc.tags LIKE ?';
    params.push(`%${tags}%`);
  }

  if (startTime) {
    sql += ' AND cc.created_at >= ?';
    params.push(startTime);
  }

  if (endTime) {
    sql += ' AND cc.created_at <= ?';
    params.push(endTime);
  }

  sql += ' ORDER BY cc.created_at DESC';

  const stmt = db.prepare(sql);
  return stmt.all(...params) as CustomerCall[];
};

export const getEventsTimeline = (startTime?: string, endTime?: string): TimelineEvent[] => {
  const db = getDb();

  let sql = `
    SELECT et.*, pe.event_type, pe.severity as event_severity, pe.location as event_location
    FROM event_timeline et
    LEFT JOIN pipe_events pe ON et.event_id = pe.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (startTime) {
    sql += ' AND et.created_at >= ?';
    params.push(startTime);
  }

  if (endTime) {
    sql += ' AND et.created_at <= ?';
    params.push(endTime);
  }

  sql += ' ORDER BY et.created_at DESC';

  const stmt = db.prepare(sql);
  return stmt.all(...params) as TimelineEvent[];
};

export const getCurrentShift = (): ShiftRecord => {
  const db = getDb();

  const today = formatDateForSql(new Date());
  const shiftType = getCurrentShiftType();

  let stmt = db.prepare(`
    SELECT sr.*,
      (SELECT COUNT(*) FROM shift_events se WHERE se.shift_id = sr.id) as event_count,
      (SELECT COUNT(*) FROM customer_calls cc WHERE cc.created_at >= sr.start_time AND (sr.end_time IS NULL OR cc.created_at <= sr.end_time)) as call_count
    FROM shift_records sr
    WHERE sr.shift_type = ?
      AND DATE(sr.start_time) = ?
      AND sr.end_time IS NULL
    ORDER BY sr.start_time DESC
    LIMIT 1
  `);

  let shift = stmt.get(shiftType, today) as ShiftRecord | undefined;

  if (!shift) {
    const now = new Date();
    let shiftStart: Date;

    if (shiftType === 'day') {
      shiftStart = new Date(now);
      shiftStart.setHours(8, 0, 0, 0);
    } else {
      shiftStart = new Date(now);
      if (now.getHours() < 8) {
        shiftStart.setDate(shiftStart.getDate() - 1);
      }
      shiftStart.setHours(20, 0, 0, 0);
    }

    const insertStmt = db.prepare(`
      INSERT INTO shift_records (shift_type, operator, start_time)
      VALUES (?, 'system', ?)
    `);

    const result = insertStmt.run(shiftType, shiftStart.toISOString());
    const shiftId = result.lastInsertRowid as number;

    logger.info(`自动创建新班次，班次ID: ${shiftId}, 类型: ${shiftType}`);

    stmt = db.prepare(`
      SELECT sr.*,
        0 as event_count,
        0 as call_count
      FROM shift_records sr
      WHERE sr.id = ?
    `);
    shift = stmt.get(shiftId) as ShiftRecord;
  }

  return shift;
};

export const createShiftHandover = (shiftId: number, summary: string, operator: string): { success: boolean } => {
  const db = getDb();

  const stmt = db.prepare(`SELECT * FROM shift_records WHERE id = ?`);
  const shift = stmt.get(shiftId) as ShiftRecord | undefined;

  if (!shift) {
    throw createError(404, `班次 ${shiftId} 不存在`);
  }

  if (shift.end_time) {
    throw createError(400, `班次 ${shiftId} 已完成交接，不能重复提交`);
  }

  const now = new Date();

  db.prepare(`
    UPDATE shift_records
    SET end_time = ?, handover_summary = ?, operator = ?
    WHERE id = ?
  `).run(now.toISOString(), summary, operator, shiftId);

  logger.info(`班次交接完成，班次ID: ${shiftId}, 操作人: ${operator}`);

  return { success: true };
};

export const getShiftHistory = (startTime?: string, endTime?: string): ShiftRecord[] => {
  const db = getDb();

  let sql = `
    SELECT sr.*,
      (SELECT COUNT(*) FROM shift_events se WHERE se.shift_id = sr.id) as event_count,
      (SELECT COUNT(*) FROM customer_calls cc WHERE cc.created_at >= sr.start_time AND (sr.end_time IS NULL OR cc.created_at <= sr.end_time)) as call_count
    FROM shift_records sr
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (startTime) {
    sql += ' AND sr.start_time >= ?';
    params.push(startTime);
  }

  if (endTime) {
    sql += ' AND (sr.end_time <= ? OR sr.end_time IS NULL)';
    params.push(endTime);
  }

  sql += ' ORDER BY sr.start_time DESC';

  const stmt = db.prepare(sql);
  return stmt.all(...params) as ShiftRecord[];
};

export const getDisposalStatistics = (startTime?: string, endTime?: string): DisposalStat[] => {
  const db = getDb();

  let whereSql = `WHERE pe.status = 'completed'`;
  const params: (string | number)[] = [];

  if (startTime) {
    whereSql += ' AND pe.created_at >= ?';
    params.push(startTime);
  }

  if (endTime) {
    whereSql += ' AND pe.created_at <= ?';
    params.push(endTime);
  }

  const sql = `
    SELECT
      pe.event_type,
      pe.severity,
      COUNT(*) as count,
      AVG(
        (
          SELECT julianday(MAX(et.created_at)) - julianday(pe.created_at)
          FROM event_timeline et
          WHERE et.event_id = pe.id
        ) * 24 * 60
      ) as avg_duration,
      MAX(
        (
          SELECT julianday(MAX(et.created_at)) - julianday(pe.created_at)
          FROM event_timeline et
          WHERE et.event_id = pe.id
        ) * 24 * 60
      ) as max_duration,
      MIN(
        (
          SELECT julianday(MAX(et.created_at)) - julianday(pe.created_at)
          FROM event_timeline et
          WHERE et.event_id = pe.id
        ) * 24 * 60
      ) as min_duration
    FROM pipe_events pe
    ${whereSql}
    GROUP BY pe.event_type, pe.severity
    ORDER BY pe.event_type, pe.severity
  `;

  const stmt = db.prepare(sql);
  const results = stmt.all(...params) as any[];

  return results.map(r => ({
    event_type: r.event_type as EventType,
    severity: r.severity as EventSeverity,
    count: r.count,
    avg_duration: Math.round(r.avg_duration || 0),
    max_duration: Math.round(r.max_duration || 0),
    min_duration: Math.round(r.min_duration || 0)
  }));
};

export const getDashboardStatistics = (): DashboardStats => {
  const db = getDb();

  const today = formatDateForSql(new Date());

  const todayEventStmt = db.prepare(`
    SELECT COUNT(*) as count FROM pipe_events
    WHERE DATE(created_at) = ?
  `);
  const todayEventCount = (todayEventStmt.get(today) as any).count as number;

  const ongoingEventStmt = db.prepare(`
    SELECT COUNT(*) as count FROM pipe_events
    WHERE status IN ('reported', 'analyzing', 'repairing')
  `);
  const ongoingEventCount = (ongoingEventStmt.get() as any).count as number;

  const avgDisposalStmt = db.prepare(`
    SELECT AVG(
      (
        SELECT julianday(MAX(et.created_at)) - julianday(pe.created_at)
        FROM event_timeline et
        WHERE et.event_id = pe.id
      ) * 24 * 60
    ) as avg_time
    FROM pipe_events pe
    WHERE pe.status = 'completed'
      AND DATE(pe.created_at) = ?
  `);
  const avgDisposalResult = avgDisposalStmt.get(today) as any;
  const todayAvgDisposalTime = Math.round(avgDisposalResult.avg_time || 0);

  const pumpStatusStmt = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM pump_groups
    GROUP BY status
  `);
  const pumpResults = pumpStatusStmt.all() as { status: PumpStatus; count: number }[];

  const pumpStatus: DashboardStats['pump_status'] = {
    running: 0,
    standby: 0,
    maintenance: 0
  };

  for (const pr of pumpResults) {
    if (pr.status in pumpStatus) {
      pumpStatus[pr.status] = pr.count;
    }
  }

  const abnormalPressureStmt = db.prepare(`
    SELECT COUNT(DISTINCT zone_id) as count
    FROM zone_monitors
    WHERE DATE(timestamp) = ?
      AND (pressure < 0.28 OR pressure > 0.45)
  `);
  const abnormalPressureZones = (abnormalPressureStmt.get(today) as any).count as number;

  return {
    today_event_count: todayEventCount,
    ongoing_event_count: ongoingEventCount,
    today_avg_disposal_time: todayAvgDisposalTime,
    pump_status: pumpStatus,
    abnormal_pressure_zones: abnormalPressureZones
  };
};
