import Joi from 'joi';

export const reportEventSchema = Joi.object({
  event_type: Joi.string().valid('burst', 'outage').required().messages({
    'any.only': '事件类型只能是 burst 或 outage',
    'any.required': '事件类型不能为空'
  }),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').required().messages({
    'any.only': '严重程度只能是 low, medium, high, critical',
    'any.required': '严重程度不能为空'
  }),
  location: Joi.string().min(1).max(200).required().messages({
    'any.required': '位置不能为空'
  }),
  description: Joi.string().max(500).allow('').optional(),
  reported_by: Joi.string().min(1).max(100).optional(),
  zone_id: Joi.number().integer().positive().optional(),
  repair_duration: Joi.number().integer().positive().optional()
});

export const getEventListSchema = Joi.object({
  status: Joi.string().valid('reported', 'analyzing', 'repairing', 'completed', 'cancelled').optional(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional()
});

export const eventIdSchema = Joi.object({
  eventId: Joi.number().integer().positive().required().messages({
    'any.required': '事件ID不能为空',
    'number.base': '事件ID必须是数字'
  })
});

export const executeValveBodySchema = Joi.object({
  valve_id: Joi.number().integer().positive().required().messages({
    'any.required': '阀门ID不能为空',
    'number.base': '阀门ID必须是数字'
  }),
  operation: Joi.string().valid('open', 'close').required().messages({
    'any.only': '操作类型只能是 open 或 close',
    'any.required': '操作类型不能为空'
  }),
  operator: Joi.string().min(1).max(100).required().messages({
    'any.required': '操作人不能为空'
  })
});

export const updateProgressBodySchema = Joi.object({
  progress: Joi.string().valid('reported', 'analyzing', 'repairing', 'completed', 'cancelled').required().messages({
    'any.only': '进度状态不合法',
    'any.required': '进度状态不能为空'
  }),
  operator: Joi.string().min(1).max(100).required().messages({
    'any.required': '操作人不能为空'
  }),
  remark: Joi.string().max(500).allow('').optional()
});
