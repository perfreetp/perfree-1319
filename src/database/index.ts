import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config/env';
import { logger } from '../utils/logger';

let db: Database.Database | null = null;

export const getDb = (): Database.Database => {
  if (!db) {
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    logger.info('数据库连接成功');
  }
  return db;
};

export const closeDb = (): void => {
  if (db) {
    db.close();
    db = null;
    logger.info('数据库连接已关闭');
  }
};
