import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validator';
import {
  zoneIdSchema,
  forecastQuerySchema,
  suggestionIdSchema,
  suggestionListSchema,
  updateSuggestionStatusSchema,
  suggestionStatusEnum,
  suggestionPriorityEnum
} from './forecast.validation';
import {
  getZoneForecast,
  getZonePeakForecast,
  getAllForecastOverview,
  getDispatchSuggestions,
  generateDispatchSuggestion,
  updateSuggestionStatus
} from './forecast.service';

const router = Router();

router.get('/forecast/:zoneId', validate(zoneIdSchema, 'params'), validate(forecastQuerySchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const zoneId = Number(req.params.zoneId);
    const { date } = req.query;
    const forecast = getZoneForecast(zoneId, date as string | undefined);
    res.json({
      code: 200,
      message: '获取分区用水预测成功',
      data: forecast
    });
  } catch (error) {
    next(error);
  }
});

router.get('/forecast/:zoneId/peak', validate(zoneIdSchema, 'params'), validate(forecastQuerySchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const zoneId = Number(req.params.zoneId);
    const { date } = req.query;
    const peakForecast = getZonePeakForecast(zoneId, date as string | undefined);
    res.json({
      code: 200,
      message: '获取分区用水峰值预测成功',
      data: peakForecast
    });
  } catch (error) {
    next(error);
  }
});

router.get('/forecast/all', (req: Request, res: Response, next: NextFunction) => {
  try {
    const overview = getAllForecastOverview();
    res.json({
      code: 200,
      message: '获取所有分区预测概览成功',
      data: overview
    });
  } catch (error) {
    next(error);
  }
});

router.get('/suggestions', validate(suggestionListSchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, priority } = req.query;
    const suggestions = getDispatchSuggestions(
      status as typeof suggestionStatusEnum[number] | undefined,
      priority as typeof suggestionPriorityEnum[number] | undefined
    );
    res.json({
      code: 200,
      message: '获取调度建议列表成功',
      data: suggestions
    });
  } catch (error) {
    next(error);
  }
});

router.post('/suggestions', (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = generateDispatchSuggestion();
    res.status(201).json({
      code: 201,
      message: '生成调度建议成功',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

router.put('/suggestions/:suggestionId', validate(suggestionIdSchema, 'params'), validate(updateSuggestionStatusSchema, 'body'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const suggestionId = Number(req.params.suggestionId);
    const { status } = req.body;
    updateSuggestionStatus(suggestionId, status);
    res.json({
      code: 200,
      message: '更新调度建议状态成功'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
