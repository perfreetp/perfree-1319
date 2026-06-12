import { getDb } from './index';

export const initSchema = (): void => {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS zone_monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id INTEGER NOT NULL,
      flow_rate REAL NOT NULL,
      pressure REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (zone_id) REFERENCES zones(id)
    );

    CREATE TABLE IF NOT EXISTS communities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      zone_id INTEGER NOT NULL,
      population INTEGER,
      households INTEGER,
      FOREIGN KEY (zone_id) REFERENCES zones(id)
    );

    CREATE TABLE IF NOT EXISTS valves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT,
      zone_id INTEGER,
      status TEXT DEFAULT 'normal',
      location TEXT,
      FOREIGN KEY (zone_id) REFERENCES zones(id)
    );

    CREATE TABLE IF NOT EXISTS pipe_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'reported',
      reported_by TEXT,
      zone_id INTEGER,
      repair_duration INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (zone_id) REFERENCES zones(id)
    );

    CREATE TABLE IF NOT EXISTS event_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      operator TEXT,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES pipe_events(id)
    );

    CREATE TABLE IF NOT EXISTS affected_communities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      community_id INTEGER NOT NULL,
      estimated_restore_time DATETIME,
      FOREIGN KEY (event_id) REFERENCES pipe_events(id),
      FOREIGN KEY (community_id) REFERENCES communities(id)
    );

    CREATE TABLE IF NOT EXISTS valve_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER,
      valve_id INTEGER NOT NULL,
      operation TEXT NOT NULL,
      recommended_order INTEGER,
      operator TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES pipe_events(id),
      FOREIGN KEY (valve_id) REFERENCES valves(id)
    );

    CREATE TABLE IF NOT EXISTS pump_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      location TEXT,
      capacity REAL
    );

    CREATE TABLE IF NOT EXISTS pump_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'standby',
      current_flow REAL DEFAULT 0,
      power REAL DEFAULT 0,
      efficiency REAL DEFAULT 0.85,
      FOREIGN KEY (station_id) REFERENCES pump_stations(id)
    );

    CREATE TABLE IF NOT EXISTS pump_controls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pump_id INTEGER NOT NULL,
      flow_rate REAL NOT NULL,
      pressure REAL NOT NULL,
      power REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pump_id) REFERENCES pump_groups(id)
    );

    CREATE TABLE IF NOT EXISTS pump_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pump_id INTEGER NOT NULL,
      request_type TEXT NOT NULL,
      reason TEXT,
      requester TEXT NOT NULL,
      approver TEXT,
      approval_opinion TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME,
      FOREIGN KEY (pump_id) REFERENCES pump_groups(id)
    );

    CREATE TABLE IF NOT EXISTS water_forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id INTEGER NOT NULL,
      forecast_date DATE NOT NULL,
      hour INTEGER NOT NULL,
      forecast_flow REAL NOT NULL,
      peak_flow REAL,
      confidence REAL DEFAULT 0.9,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (zone_id) REFERENCES zones(id)
    );

    CREATE TABLE IF NOT EXISTS dispatch_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggestion_type TEXT NOT NULL,
      content TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      event_id INTEGER,
      target_audience TEXT,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES pipe_events(id)
    );

    CREATE TABLE IF NOT EXISTS customer_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caller_phone TEXT,
      call_type TEXT NOT NULL,
      tags TEXT,
      event_id INTEGER,
      operator TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES pipe_events(id)
    );

    CREATE TABLE IF NOT EXISTS shift_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_type TEXT NOT NULL,
      operator TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      handover_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shift_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      event_id INTEGER,
      note TEXT,
      FOREIGN KEY (shift_id) REFERENCES shift_records(id),
      FOREIGN KEY (event_id) REFERENCES pipe_events(id)
    );
  `);
};
