import { runMigrations } from './migrations';

export const initSchema = (): void => {
  runMigrations();
};
