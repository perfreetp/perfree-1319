export const config = {
  port: process.env.PORT || 3000,
  dbPath: process.env.DB_PATH || './data/water_dispatch.db',
  logLevel: process.env.LOG_LEVEL || 'info',
  apiPrefix: '/api/v1'
};
