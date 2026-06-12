import { getDb } from './index';
import { logger } from '../utils/logger';

type Migration = {
  version: number;
  description: string;
  up: (db: any) => void;
};

const columnExists = (db: any, tableName: string, columnName: string): boolean => {
  const result = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return result.some((col: any) => col.name === columnName);
};

const tableExists = (db: any, tableName: string): boolean => {
  const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tableName);
  return !!result;
};

export const migrations: Migration[] = [
  {
    version: 1,
    description: '初始化基础表结构（zones/communities/valves/pipe_events 等）',
    up: (db: any) => {
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
    }
  },
  {
    version: 2,
    description: '补齐基础表遗漏列：pipe_events.repair_duration、pump_groups.efficiency',
    up: (db: any) => {
      if (!columnExists(db, 'pipe_events', 'repair_duration')) {
        db.exec(`ALTER TABLE pipe_events ADD COLUMN repair_duration INTEGER`);
      }
      if (!columnExists(db, 'pump_groups', 'efficiency')) {
        db.exec(`ALTER TABLE pump_groups ADD COLUMN efficiency REAL DEFAULT 0.85`);
      }
    }
  },
  {
    version: 3,
    description: '新增泵组审计表 pump_audit_logs',
    up: (db: any) => {
      if (!tableExists(db, 'pump_audit_logs')) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS pump_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pump_id INTEGER NOT NULL,
            request_id INTEGER,
            action TEXT NOT NULL,
            old_status TEXT,
            new_status TEXT,
            operator TEXT NOT NULL,
            remark TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pump_id) REFERENCES pump_groups(id),
            FOREIGN KEY (request_id) REFERENCES pump_requests(id)
          );
        `);
      }
    }
  },
  {
    version: 4,
    description: 'pump_controls 新增 request_id 外键，用于关联启停申请单',
    up: (db: any) => {
      if (!columnExists(db, 'pump_controls', 'request_id')) {
        db.exec(`ALTER TABLE pump_controls ADD COLUMN request_id INTEGER REFERENCES pump_requests(id)`);
      }
    }
  }
];

export const runMigrations = (): void => {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedVersions = new Set<number>(
    db.prepare('SELECT version FROM schema_migrations').all().map((r: any) => r.version)
  );

  const pendingMigrations = migrations
    .filter(m => !appliedVersions.has(m.version))
    .sort((a, b) => a.version - b.version);

  if (pendingMigrations.length === 0) {
    logger.info(`数据库结构已是最新（共 ${appliedVersions.size} 个迁移已应用）`);
    return;
  }

  logger.info(`检测到 ${pendingMigrations.length} 个待执行数据库迁移，开始应用...`);

  const insertMigrationStmt = db.prepare(`
    INSERT INTO schema_migrations (version, description) VALUES (?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const migration of pendingMigrations) {
      logger.info(`应用迁移 v${migration.version}：${migration.description}`);
      migration.up(db);
      insertMigrationStmt.run(migration.version, migration.description);
    }
  });

  try {
    transaction();
    logger.info(`✅ 数据库迁移完成，成功应用 ${pendingMigrations.length} 个迁移`);
  } catch (error: any) {
    logger.error(`❌ 数据库迁移失败：${error.message}`);
    throw error;
  }
};
