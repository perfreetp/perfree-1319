import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validator';
import {
  pumpListSchema,
  pumpIdSchema,
  requestIdSchema,
  pumpHistoryQuerySchema,
  createPumpRequestSchema,
  pumpRequestListSchema,
  approvePumpRequestBodySchema,
  addPumpControlSchema
} from './pump.validation';
import {
  getStations,
  getPumpList,
  getPumpDetail,
  getPumpHistory,
  createPumpRequest,
  getPumpRequests,
  approvePumpRequest,
  addPumpControlRecord
} from './pump.service';

const router = Router();

router.get('/stations', (req: Request, res: Response, next: NextFunction) => {
  try {
    const stations = getStations();
    res.json({
      code: 200,
      message: '获取泵站列表成功',
      data: stations
    });
  } catch (error) {
    next(error);
  }
});

router.get('/pumps', validate(pumpListSchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { stationId } = req.query;
    const pumps = getPumpList(stationId ? Number(stationId) : undefined);
    res.json({
      code: 200,
      message: '获取泵组列表成功',
      data: pumps
    });
  } catch (error) {
    next(error);
  }
});

router.get('/pumps/:pumpId', validate(pumpIdSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const pumpId = Number(req.params.pumpId);
    const pump = getPumpDetail(pumpId);
    res.json({
      code: 200,
      message: '获取泵组详情成功',
      data: pump
    });
  } catch (error) {
    next(error);
  }
});

router.get('/pumps/:pumpId/history', validate(pumpIdSchema, 'params'), validate(pumpHistoryQuerySchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const pumpId = Number(req.params.pumpId);
    const { startTime, endTime } = req.query;
    const history = getPumpHistory(
      pumpId,
      startTime as string | undefined,
      endTime as string | undefined
    );
    res.json({
      code: 200,
      message: '获取泵组运行历史成功',
      data: history
    });
  } catch (error) {
    next(error);
  }
});

router.post('/pumps/requests', validate(createPumpRequestSchema, 'body'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pumpId, requestType, reason, requester } = req.body;
    const requestId = createPumpRequest(pumpId, requestType, reason, requester);
    res.status(201).json({
      code: 201,
      message: '申请创建成功',
      data: { requestId }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/pumps/requests', validate(pumpRequestListSchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;
    const requests = getPumpRequests(status as 'pending' | 'approved' | 'rejected' | undefined);
    res.json({
      code: 200,
      message: '获取申请列表成功',
      data: requests
    });
  } catch (error) {
    next(error);
  }
});

router.put('/pumps/requests/:requestId/approve', validate(requestIdSchema, 'params'), validate(approvePumpRequestBodySchema, 'body'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = Number(req.params.requestId);
    const { approver, opinion, approved } = req.body;
    approvePumpRequest(requestId, approver, opinion, approved);
    res.json({
      code: 200,
      message: approved ? '申请审批通过' : '申请已驳回'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/pumps/controls', validate(addPumpControlSchema, 'body'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pumpId, flowRate, pressure, power } = req.body;
    const recordId = addPumpControlRecord(pumpId, flowRate, pressure, power);
    res.status(201).json({
      code: 201,
      message: '运行数据记录成功',
      data: { recordId }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
