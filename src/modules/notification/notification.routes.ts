import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validator';
import {
  getNotificationListSchema,
  notificationIdSchema,
  eventIdSchema,
  createNotificationSchema
} from './notification.validation';
import {
  getNotificationList,
  getNotificationDetail,
  createNotification,
  sendNotification,
  getEventNotifications,
  generateWaterOutageNotification,
  NotificationType,
  NotificationStatus
} from './notification.service';

const router = Router();

router.get('/notifications', validate(getNotificationListSchema, 'query'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, status } = req.query;
    const notifications = getNotificationList(
      type as NotificationType | undefined,
      status as NotificationStatus | undefined
    );
    res.json({
      code: 200,
      message: '获取通知列表成功',
      data: notifications
    });
  } catch (error) {
    next(error);
  }
});

router.get('/notifications/:notificationId', validate(notificationIdSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = Number(req.params.notificationId);
    const notification = getNotificationDetail(notificationId);
    res.json({
      code: 200,
      message: '获取通知详情成功',
      data: notification
    });
  } catch (error) {
    next(error);
  }
});

router.post('/notifications', validate(createNotificationSchema, 'body'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = createNotification(req.body);
    res.status(201).json({
      code: 201,
      message: '通知创建成功',
      data: { notificationId }
    });
  } catch (error) {
    next(error);
  }
});

router.put('/notifications/:notificationId/send', validate(notificationIdSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = Number(req.params.notificationId);
    const result = sendNotification(notificationId);
    res.json({
      code: 200,
      message: '通知已发送',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

router.get('/notifications/event/:eventId', validate(eventIdSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = Number(req.params.eventId);
    const notifications = getEventNotifications(eventId);
    res.json({
      code: 200,
      message: '获取事件关联通知成功',
      data: notifications
    });
  } catch (error) {
    next(error);
  }
});

router.post('/notifications/generate/water-outage/:eventId', validate(eventIdSchema, 'params'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = Number(req.params.eventId);
    const notificationContent = generateWaterOutageNotification(eventId);
    res.json({
      code: 200,
      message: '停水通知生成成功',
      data: notificationContent
    });
  } catch (error) {
    next(error);
  }
});

export default router;
