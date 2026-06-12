import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validator';
import {
  createCustomerCallSchema,
  getCustomerCallsSchema,
  getEventsTimelineSchema,
  createShiftHandoverSchema,
  getShiftHistorySchema,
  getDisposalStatisticsSchema
} from './query.validation';
import {
  createCustomerCall,
  getCustomerCalls,
  getEventsTimeline,
  getCurrentShift,
  createShiftHandover,
  getShiftHistory,
  getDisposalStatistics,
  getDashboardStatistics
} from './query.service';
import { getEventTimeline } from '../pipeEvent/pipeEvent.service';
import { eventIdSchema } from '../pipeEvent/pipeEvent.validation';

const router = Router();

router.post('/customer-calls', validate(createCustomerCallSchema, 'body'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const callId = createCustomerCall(req.body);
    res.status(201).json({
      code: 201,
      message: '用户来电记录创建成功',
      data: { callId }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/customer-calls', validate(getCustomerCallsSchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tags, startTime, endTime } = req.query;
    const calls = getCustomerCalls(tags as string, startTime as string, endTime as string);
    res.json({
      code: 200,
      message: '获取来电记录成功',
      data: calls
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events/timeline', validate(getEventsTimelineSchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startTime, endTime } = req.query;
    const timeline = getEventsTimeline(startTime as string, endTime as string);
    res.json({
      code: 200,
      message: '获取事件时间线成功',
      data: timeline
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events/timeline/:eventId', validate(eventIdSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = Number(req.params.eventId);
    const timeline = getEventTimeline(eventId);
    res.json({
      code: 200,
      message: '获取单事件时间线成功',
      data: timeline
    });
  } catch (error) {
    next(error);
  }
});

router.get('/shifts/current', (req: Request, res: Response, next: NextFunction) => {
  try {
    const shift = getCurrentShift();
    res.json({
      code: 200,
      message: '获取当前班次信息成功',
      data: shift
    });
  } catch (error) {
    next(error);
  }
});

router.post('/shifts/handover', validate(createShiftHandoverSchema, 'body'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shift_id, summary, operator } = req.body;
    const result = createShiftHandover(shift_id, summary, operator);
    res.json({
      code: 200,
      message: '班次交接提交成功',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

router.get('/shifts/history', validate(getShiftHistorySchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startTime, endTime } = req.query;
    const shifts = getShiftHistory(startTime as string, endTime as string);
    res.json({
      code: 200,
      message: '获取历史班次记录成功',
      data: shifts
    });
  } catch (error) {
    next(error);
  }
});

router.get('/statistics/disposal', validate(getDisposalStatisticsSchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startTime, endTime } = req.query;
    const statistics = getDisposalStatistics(startTime as string, endTime as string);
    res.json({
      code: 200,
      message: '获取事件处置时长统计成功',
      data: statistics
    });
  } catch (error) {
    next(error);
  }
});

router.get('/statistics/dashboard', (req: Request, res: Response, next: NextFunction) => {
  try {
    const statistics = getDashboardStatistics();
    res.json({
      code: 200,
      message: '获取大屏统计概览成功',
      data: statistics
    });
  } catch (error) {
    next(error);
  }
});

export default router;
