import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { initSchema } from './database/schema';

import situationRoutes from './modules/situation/situation.routes';
import pipeEventRoutes from './modules/pipeEvent/pipeEvent.routes';
import pumpRoutes from './modules/pump/pump.routes';
import forecastRoutes from './modules/forecast/forecast.routes';
import notificationRoutes from './modules/notification/notification.routes';
import queryRoutes from './modules/query/query.routes';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({
    code: 200,
    message: 'success',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'water-supply-dispatch'
    }
  });
});

const apiPrefix = config.apiPrefix;
app.use(`${apiPrefix}/situation`, situationRoutes);
app.use(`${apiPrefix}/pipe-events`, pipeEventRoutes);
app.use(`${apiPrefix}/pump-control`, pumpRoutes);
app.use(`${apiPrefix}/forecast`, forecastRoutes);
app.use(`${apiPrefix}/notification`, notificationRoutes);
app.use(`${apiPrefix}/query`, queryRoutes);

app.get('/', (req, res) => {
  res.json({
    code: 200,
    message: '欢迎使用供水调度后端服务',
    data: {
      service: 'water-supply-dispatch',
      version: '1.0.0',
      modules: [
        { name: '实时态势', prefix: `${apiPrefix}/situation` },
        { name: '管网事件', prefix: `${apiPrefix}/pipe-events` },
        { name: '泵站控制', prefix: `${apiPrefix}/pump-control` },
        { name: '用水预测', prefix: `${apiPrefix}/forecast` },
        { name: '通知管理', prefix: `${apiPrefix}/notification` },
        { name: '查询统计', prefix: `${apiPrefix}/query` }
      ],
      docs: '请参考 README.md 了解详细API文档'
    }
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  try {
    initSchema();
    logger.info('数据库初始化完成');

    app.listen(config.port, () => {
      logger.info(`🚀 供水调度后端服务已启动`);
      logger.info(`📍 服务地址: http://localhost:${config.port}`);
      logger.info(`📡 API前缀: ${config.apiPrefix}`);
      logger.info(`📚 健康检查: http://localhost:${config.port}/health`);
    });
  } catch (error) {
    logger.error('服务启动失败:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => {
  logger.info('收到终止信号，正在关闭服务...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('收到终止信号，正在关闭服务...');
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

export default app;
