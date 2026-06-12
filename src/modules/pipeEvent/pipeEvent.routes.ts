import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validator';
import {
  reportEventSchema,
  getEventListSchema,
  eventIdSchema,
  executeValveBodySchema,
  updateProgressBodySchema
} from './pipeEvent.validation';
import {
  reportEvent,
  getEventList,
  getEventDetail,
  calculateAffectedCommunities,
  getAffectedCommunities,
  getValveRecommendation,
  executeValveOperation,
  updateRepairProgress,
  getEventTimeline
} from './pipeEvent.service';

const router = Router();

router.post('/events', validate(reportEventSchema, 'body'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = reportEvent(req.body);
    res.status(201).json({
      code: 201,
      message: '事件上报成功',
      data: { eventId }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events', validate(getEventListSchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, severity } = req.query;
    const events = getEventList(status as any, severity as any);
    res.json({
      code: 200,
      message: '获取事件列表成功',
      data: events
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events/:eventId', validate(eventIdSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = Number(req.params.eventId);
    const event = getEventDetail(eventId);
    res.json({
      code: 200,
      message: '获取事件详情成功',
      data: event
    });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:eventId/affected', validate(eventIdSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = Number(req.params.eventId);
    const result = calculateAffectedCommunities(eventId);
    res.json({
      code: 200,
      message: '影响小区计算完成',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events/:eventId/affected', validate(eventIdSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = Number(req.params.eventId);
    const communities = getAffectedCommunities(eventId);
    res.json({
      code: 200,
      message: '获取影响小区成功',
      data: communities
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events/:eventId/valves', validate(eventIdSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = Number(req.params.eventId);
    const valves = getValveRecommendation(eventId);
    res.json({
      code: 200,
      message: '获取推荐关阀顺序成功',
      data: valves
    });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:eventId/valves/execute', validate(eventIdSchema, 'params'), validate(executeValveBodySchema, 'body'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = Number(req.params.eventId);
    const { valve_id, operation, operator } = req.body;
    const result = executeValveOperation(eventId, valve_id, operation, operator);
    res.json({
      code: 200,
      message: result.message,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:eventId/progress', validate(eventIdSchema, 'params'), validate(updateProgressBodySchema, 'body'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = Number(req.params.eventId);
    const { progress, operator, remark } = req.body;
    const result = updateRepairProgress(eventId, progress, operator, remark);
    res.json({
      code: 200,
      message: '抢修进度更新成功',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events/:eventId/timeline', validate(eventIdSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = Number(req.params.eventId);
    const timeline = getEventTimeline(eventId);
    res.json({
      code: 200,
      message: '获取事件时间线成功',
      data: timeline
    });
  } catch (error) {
    next(error);
  }
});

export default router;
