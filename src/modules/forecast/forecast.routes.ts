import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validator';
import {
  zoneIdSchema,
  forecastQuerySchema,
  multiDayForecastQuerySchema,
  peakTrendQuerySchema,
  suggestionIdSchema,
  suggestionListSchema,
  updateSuggestionStatusSchema,
  suggestionStatusEnum,
  suggestionPriorityEnum,
  zoneComparisonQuerySchema,
  peakRiskRankingQuerySchema
} from './forecast.validation';
import {
  getZoneForecast,
  getZonePeakForecast,
  getAllForecastOverview,
  getMultiDayForecast,
  getPeakTrend,
  getDispatchSuggestions,
  generateDispatchSuggestion,
  updateSuggestionStatus,
  getZoneComparison,
  getPeakRiskRanking
} from './forecast.service';

const router = Router();

router.get('/overview', (req: Request, res: Response, next: NextFunction) => {
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

router.get('/all', (req: Request, res: Response, next: NextFunction) => {
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

router.get('/peak-trend', validate(peakTrendQuerySchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, holidayFactor, weatherFactor } = req.query;
    const result = getPeakTrend(
      startDate as string,
      endDate as string,
      holidayFactor ? Number(holidayFactor) : 1.0,
      weatherFactor ? Number(weatherFactor) : 1.0
    );
    res.json({
      code: 200,
      message: '获取各分区峰值趋势成功',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

router.get('/zone-comparison', validate(zoneComparisonQuerySchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, holidayFactor, weatherFactor } = req.query;
    const result = getZoneComparison(
      startDate as string,
      endDate as string,
      holidayFactor ? Number(holidayFactor) : 1.0,
      weatherFactor ? Number(weatherFactor) : 1.0
    );
    res.json({
      code: 200,
      message: '获取分区对比数据成功',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

router.get('/peak-risk-ranking', validate(peakRiskRankingQuerySchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date, holidayFactor, weatherFactor } = req.query;
    const result = getPeakRiskRanking(
      date as string | undefined,
      holidayFactor ? Number(holidayFactor) : 1.0,
      weatherFactor ? Number(weatherFactor) : 1.0
    );
    res.json({
      code: 200,
      message: '获取高峰风险排行成功',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

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

router.get('/forecast/:zoneId/multi-day', validate(zoneIdSchema, 'params'), validate(multiDayForecastQuerySchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const zoneId = Number(req.params.zoneId);
    const { startDate, endDate, holidayFactor, weatherFactor } = req.query;
    const result = getMultiDayForecast(
      zoneId,
      startDate as string,
      endDate as string,
      holidayFactor ? Number(holidayFactor) : 1.0,
      weatherFactor ? Number(weatherFactor) : 1.0
    );
    res.json({
      code: 200,
      message: '获取多日用水预测成功',
      data: result
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
