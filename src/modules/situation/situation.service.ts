import { getDb } from '../../database';
import { createError } from '../../middleware/errorHandler';

interface Zone {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

interface ZoneMonitor {
  id: number;
  zone_id: number;
  flow_rate: number;
  pressure: number;
  timestamp: string;
}

interface ZoneMonitorWithInfo extends ZoneMonitor {
  zone_name: string;
}

interface ZoneMonitorDetail {
  latest: ZoneMonitor;
  trend: ZoneMonitor[];
}

const db = getDb();

export const getZones = (): Zone[] => {
  const stmt = db.prepare('SELECT * FROM zones ORDER BY id');
  return stmt.all() as Zone[];
};

export const getZoneMonitor = (zoneId: number): ZoneMonitorDetail => {
  const zoneStmt = db.prepare('SELECT * FROM zones WHERE id = ?');
  const zone = zoneStmt.get(zoneId) as Zone | undefined;

  if (!zone) {
    throw createError(404, '分区不存在');
  }

  const latestStmt = db.prepare(`
    SELECT * FROM zone_monitors 
    WHERE zone_id = ? 
    ORDER BY timestamp DESC 
    LIMIT 1
  `);
  const latest = latestStmt.get(zoneId) as ZoneMonitor | undefined;

  const trendStmt = db.prepare(`
    SELECT * FROM zone_monitors 
    WHERE zone_id = ? 
    AND timestamp >= datetime('now', '-24 hours') 
    ORDER BY timestamp ASC
  `);
  const trend = trendStmt.all(zoneId) as ZoneMonitor[];

  if (!latest) {
    throw createError(404, '分区暂无监控数据');
  }

  return {
    latest,
    trend
  };
};

export const getAllZoneMonitors = (): ZoneMonitorWithInfo[] => {
  const stmt = db.prepare(`
    SELECT zm.*, z.name as zone_name
    FROM zone_monitors zm
    INNER JOIN zones z ON zm.zone_id = z.id
    INNER JOIN (
      SELECT zone_id, MAX(timestamp) as max_time
      FROM zone_monitors
      GROUP BY zone_id
    ) latest ON zm.zone_id = latest.zone_id AND zm.timestamp = latest.max_time
    ORDER BY z.id
  `);
  return stmt.all() as ZoneMonitorWithInfo[];
};

export const addZoneMonitor = (zoneId: number, flowRate: number, pressure: number): ZoneMonitor => {
  const zoneStmt = db.prepare('SELECT * FROM zones WHERE id = ?');
  const zone = zoneStmt.get(zoneId) as Zone | undefined;

  if (!zone) {
    throw createError(404, '分区不存在');
  }

  const stmt = db.prepare(`
    INSERT INTO zone_monitors (zone_id, flow_rate, pressure) 
    VALUES (?, ?, ?)
  `);
  const info = stmt.run(zoneId, flowRate, pressure);

  const selectStmt = db.prepare('SELECT * FROM zone_monitors WHERE id = ?');
  const result = selectStmt.get(info.lastInsertRowid) as ZoneMonitor;
  return result;
};
