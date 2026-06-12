import { getDb } from '../../database';
import { createError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

type EventType = 'burst' | 'outage';
type EventSeverity = 'low' | 'medium' | 'high' | 'critical';
type EventStatus = 'reported' | 'analyzing' | 'repairing' | 'completed' | 'cancelled';
type ValveOperation = 'open' | 'close';

export type EventData = {
  event_type: EventType;
  severity: EventSeverity;
  location: string;
  description?: string;
  reported_by?: string;
  zone_id?: number;
  repair_duration?: number;
};

type PipeEvent = {
  id: number;
  event_type: EventType;
  severity: EventSeverity;
  location: string;
  description: string | null;
  status: EventStatus;
  reported_by: string | null;
  zone_id: number | null;
  repair_duration: number | null;
  created_at: string;
  zone_name?: string;
};

type EventTimeline = {
  id: number;
  event_id: number;
  action: string;
  operator: string | null;
  remark: string | null;
  created_at: string;
};

type AffectedCommunity = {
  id: number;
  event_id: number;
  community_id: number;
  estimated_restore_time: string | null;
  community_name?: string;
  population?: number;
  households?: number;
  zone_name?: string;
};

type Valve = {
  id: number;
  code: string;
  name: string | null;
  zone_id: number | null;
  status: string;
  location: string | null;
  zone_name?: string;
  recommended_order?: number;
  priority_score?: number;
  estimated_impact?: string;
};

const addTimeline = (eventId: number, action: string, operator?: string, remark?: string): void => {
  const db = getDb();
  db.prepare(`
    INSERT INTO event_timeline (event_id, action, operator, remark)
    VALUES (?, ?, ?, ?)
  `).run(eventId, action, operator || null, remark || null);
};

export const reportEvent = (eventData: EventData): number => {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO pipe_events (event_type, severity, location, description, reported_by, zone_id, repair_duration, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'reported')
  `);

  const result = stmt.run(
    eventData.event_type,
    eventData.severity,
    eventData.location,
    eventData.description || null,
    eventData.reported_by || null,
    eventData.zone_id || null,
    eventData.repair_duration || null
  );

  const eventId = result.lastInsertRowid as number;

  addTimeline(eventId, '事件上报', eventData.reported_by, eventData.description);

  logger.info(`事件上报成功，事件ID: ${eventId}`);

  return eventId;
};

export const getEventList = (status?: EventStatus, severity?: EventSeverity): PipeEvent[] => {
  const db = getDb();

  let sql = `
    SELECT pe.*, z.name as zone_name
    FROM pipe_events pe
    LEFT JOIN zones z ON pe.zone_id = z.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (status) {
    sql += ' AND pe.status = ?';
    params.push(status);
  }

  if (severity) {
    sql += ' AND pe.severity = ?';
    params.push(severity);
  }

  sql += ' ORDER BY pe.created_at DESC';

  const stmt = db.prepare(sql);
  return stmt.all(...params) as PipeEvent[];
};

export const getEventDetail = (eventId: number): PipeEvent => {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT pe.*, z.name as zone_name
    FROM pipe_events pe
    LEFT JOIN zones z ON pe.zone_id = z.id
    WHERE pe.id = ?
  `);
  const event = stmt.get(eventId) as PipeEvent;

  if (!event) {
    throw createError(404, `事件 ${eventId} 不存在`);
  }

  return event;
};

export const calculateAffectedCommunities = (eventId: number): { count: number; communities: AffectedCommunity[] } => {
  const db = getDb();

  const event = getEventDetail(eventId);

  db.prepare(`DELETE FROM affected_communities WHERE event_id = ?`).run(eventId);

  let communities: any[] = [];

  if (event.zone_id) {
    const stmt = db.prepare(`
      SELECT c.*, z.name as zone_name
      FROM communities c
      LEFT JOIN zones z ON c.zone_id = z.id
      WHERE c.zone_id = ?
    `);
    communities = stmt.all(event.zone_id);
  } else {
    const stmt = db.prepare(`
      SELECT c.*, z.name as zone_name
      FROM communities c
      LEFT JOIN zones z ON c.zone_id = z.id
    `);
    communities = stmt.all();
  }

  const estimatedRestoreTime = event.repair_duration
    ? new Date(Date.now() + event.repair_duration * 60 * 60 * 1000).toISOString()
    : null;

  const insertStmt = db.prepare(`
    INSERT INTO affected_communities (event_id, community_id, estimated_restore_time)
    VALUES (?, ?, ?)
  `);

  const transaction = db.transaction((comms: any[]) => {
    for (const comm of comms) {
      insertStmt.run(eventId, comm.id, estimatedRestoreTime);
    }
  });

  transaction(communities);

  addTimeline(eventId, '计算影响小区', 'system', `共影响 ${communities.length} 个小区`);

  logger.info(`事件 ${eventId} 影响小区计算完成，共 ${communities.length} 个`);

  return {
    count: communities.length,
    communities: communities.map((c: any) => ({
      ...c,
      estimated_restore_time: estimatedRestoreTime
    })) as AffectedCommunity[]
  };
};

export const getAffectedCommunities = (eventId: number): AffectedCommunity[] => {
  const db = getDb();

  getEventDetail(eventId);

  const stmt = db.prepare(`
    SELECT ac.*, c.name as community_name, c.population, c.households, z.name as zone_name
    FROM affected_communities ac
    LEFT JOIN communities c ON ac.community_id = c.id
    LEFT JOIN zones z ON c.zone_id = z.id
    WHERE ac.event_id = ?
    ORDER BY c.name
  `);
  return stmt.all(eventId) as AffectedCommunity[];
};

export const getValveRecommendation = (eventId: number): Valve[] => {
  const db = getDb();

  const event = getEventDetail(eventId);

  let valves: Valve[] = [];

  if (event.zone_id) {
    const stmt = db.prepare(`
      SELECT v.*, z.name as zone_name
      FROM valves v
      LEFT JOIN zones z ON v.zone_id = z.id
      WHERE v.zone_id = ? AND v.status = 'normal'
      ORDER BY v.id
    `);
    valves = stmt.all(event.zone_id) as Valve[];
  } else {
    const stmt = db.prepare(`
      SELECT v.*, z.name as zone_name
      FROM valves v
      LEFT JOIN zones z ON v.zone_id = z.id
      WHERE v.status = 'normal'
      ORDER BY v.id
    `);
    valves = stmt.all() as Valve[];
  }

  const scoredValves = valves.map((valve, index) => {
    const distanceScore = index + 1;
    const impactScore = valve.zone_id ? 1 : 2;
    const priority = distanceScore * impactScore;

    return {
      ...valve,
      recommended_order: index + 1,
      priority_score: priority,
      estimated_impact: valve.zone_id ? 'zone' : 'system'
    };
  });

  scoredValves.sort((a, b) => (a.priority_score || 0) - (b.priority_score || 0));

  const deleteStmt = db.prepare(`DELETE FROM valve_operations WHERE event_id = ? AND status = 'pending'`);
  deleteStmt.run(eventId);

  const insertStmt = db.prepare(`
    INSERT INTO valve_operations (event_id, valve_id, operation, recommended_order, status)
    VALUES (?, ?, 'close', ?, 'pending')
  `);

  const transaction = db.transaction((valveList: Valve[]) => {
    for (const v of valveList) {
      insertStmt.run(eventId, v.id, v.recommended_order);
    }
  });

  transaction(scoredValves);

  return scoredValves;
};

export const executeValveOperation = (
  eventId: number,
  valveId: number,
  operation: ValveOperation,
  operator: string
): { success: boolean; message: string } => {
  const db = getDb();

  getEventDetail(eventId);

  const valveStmt = db.prepare(`SELECT * FROM valves WHERE id = ?`);
  const valve = valveStmt.get(valveId) as Valve;
  if (!valve) {
    throw createError(404, `阀门 ${valveId} 不存在`);
  }

  const newStatus = operation === 'close' ? 'closed' : 'normal';
  const actionText = operation === 'close' ? '关闭阀门' : '开启阀门';

  db.prepare(`UPDATE valves SET status = ? WHERE id = ?`).run(newStatus, valveId);

  const existingOpStmt = db.prepare(`
    SELECT id FROM valve_operations WHERE event_id = ? AND valve_id = ? AND status = 'pending'
  `);
  const existingOp = existingOpStmt.get(eventId, valveId);

  if (existingOp) {
    db.prepare(`
      UPDATE valve_operations
      SET operation = ?, operator = ?, status = 'executed', created_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(operation, operator, (existingOp as any).id);
  } else {
    db.prepare(`
      INSERT INTO valve_operations (event_id, valve_id, operation, operator, status)
      VALUES (?, ?, ?, ?, 'executed')
    `).run(eventId, valveId, operation, operator);
  }

  addTimeline(eventId, actionText, operator, `阀门: ${valve.code || valve.name || valveId}`);

  logger.info(`事件 ${eventId}: ${operator} ${actionText} ${valve.code || valveId}`);

  return {
    success: true,
    message: `阀门 ${valve.code || valveId} ${operation === 'close' ? '关闭' : '开启'}成功`
  };
};

export const updateRepairProgress = (
  eventId: number,
  progress: EventStatus,
  operator: string,
  remark?: string
): { success: boolean } => {
  const db = getDb();

  getEventDetail(eventId);

  db.prepare(`UPDATE pipe_events SET status = ? WHERE id = ?`).run(progress, eventId);

  const actionMap: Record<EventStatus, string> = {
    'reported': '事件已上报',
    'analyzing': '开始分析事件',
    'repairing': '开始抢修作业',
    'completed': '抢修完成',
    'cancelled': '事件已取消'
  };

  addTimeline(eventId, actionMap[progress] || progress, operator, remark);

  logger.info(`事件 ${eventId} 状态更新为 ${progress}，操作人: ${operator}`);

  return { success: true };
};

export const getEventTimeline = (eventId: number): EventTimeline[] => {
  const db = getDb();

  getEventDetail(eventId);

  const stmt = db.prepare(`
    SELECT * FROM event_timeline
    WHERE event_id = ?
    ORDER BY created_at ASC
  `);
  return stmt.all(eventId) as EventTimeline[];
};
