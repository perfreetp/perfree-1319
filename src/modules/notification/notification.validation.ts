import Joi from 'joi';

export const notificationTypeEnum = ['water_outage', 'leak_alert', 'maintenance', 'emergency'] as const;
export const notificationStatusEnum = ['draft', 'sent', 'cancelled'] as const;

export const getNotificationListSchema = Joi.object({
  type: Joi.string().valid(...notificationTypeEnum).optional().messages({
    'any.only': '通知类型只能是 water_outage, leak_alert, maintenance, emergency'
  }),
  status: Joi.string().valid(...notificationStatusEnum).optional().messages({
    'any.only': '通知状态只能是 draft, sent, cancelled'
  })
});

export const notificationIdSchema = Joi.object({
  notificationId: Joi.number().integer().positive().required().messages({
    'any.required': '通知ID不能为空',
    'number.base': '通知ID必须是数字'
  })
});

export const eventIdSchema = Joi.object({
  eventId: Joi.number().integer().positive().required().messages({
    'any.required': '事件ID不能为空',
    'number.base': '事件ID必须是数字'
  })
});

export const createNotificationSchema = Joi.object({
  notification_type: Joi.string().valid(...notificationTypeEnum).required().messages({
    'any.only': '通知类型只能是 water_outage, leak_alert, maintenance, emergency',
    'any.required': '通知类型不能为空'
  }),
  title: Joi.string().min(1).max(200).required().messages({
    'any.required': '通知标题不能为空',
    'string.max': '通知标题不能超过200个字符'
  }),
  content: Joi.string().min(1).max(2000).required().messages({
    'any.required': '通知内容不能为空',
    'string.max': '通知内容不能超过2000个字符'
  }),
  event_id: Joi.number().integer().positive().optional(),
  target_audience: Joi.string().min(1).max(500).optional()
});
