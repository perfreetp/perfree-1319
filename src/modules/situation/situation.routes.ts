import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validator';
import { zoneIdParamSchema, zoneMonitorBodySchema } from './situation.validation';
import { getZones, getZoneMonitor, getAllZoneMonitors, addZoneMonitor } from './situation.service';

const router = Router();

router.get('/zones', (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = getZones();
    res.json({
      code: 200,
      message: 'success',
      data
    });
  } catch (error) {
    next(error);
  }
});

router.get('/zones/monitor/all', (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = getAllZoneMonitors();
    res.json({
      code: 200,
      message: 'success',
      data
    });
  } catch (error) {
    next(error);
  }
});

router.get('/zones/:zoneId/monitor', validate(zoneIdParamSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const zoneId = parseInt(req.params.zoneId as string, 10);
    const data = getZoneMonitor(zoneId);
    res.json({
      code: 200,
      message: 'success',
      data
    });
  } catch (error) {
    next(error);
  }
});

router.post('/zones/monitor', validate(zoneMonitorBodySchema, 'body'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { zoneId, flowRate, pressure } = req.body;
    const data = addZoneMonitor(zoneId, flowRate, pressure);
    res.status(201).json({
      code: 201,
      message: 'success',
      data
    });
  } catch (error) {
    next(error);
  }
});

export default router;
