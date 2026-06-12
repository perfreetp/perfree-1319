import Joi from 'joi';

export const createCustomerCallSchema = Joi.object({
  caller_phone: Joi.string().pattern(/^1[3-9]\d{9}$/).optional().messages({
    'string.pattern.base': '手机号码格式不正确'
  }),
  call_type: Joi.string().valid('complaint', 'consultation', 'report', 'emergency').required().messages({
    'any.only': '来电类型只能是 complaint, consultation, report, emergency',
    'any.required': '来电类型不能为空'
  }),
  tags: Joi.array().items(Joi.string().valid('停水', '水质', '水压', '漏水', '抄表', '其他')).optional(),
  event_id: Joi.number().integer().positive().optional(),
  operator: Joi.string().min(1).max(100).required().messages({
    'any.required': '操作人不能为空'
  }),
  description: Joi.string().max(500).allow('').optional()
});

export const getCustomerCallsSchema = Joi.object({
  tags: Joi.string().optional(),
  startTime: Joi.string().isoDate().optional().messages({
    'string.isoDate': '开始时间格式不正确，应为ISO格式'
  }),
  endTime: Joi.string().isoDate().optional().messages({
    'string.isoDate': '结束时间格式不正确，应为ISO格式'
  })
});

export const getEventsTimelineSchema = Joi.object({
  startTime: Joi.string().isoDate().optional().messages({
    'string.isoDate': '开始时间格式不正确，应为ISO格式'
  }),
  endTime: Joi.string().isoDate().optional().messages({
    'string.isoDate': '结束时间格式不正确，应为ISO格式'
  })
});

export const createShiftHandoverSchema = Joi.object({
  shift_id: Joi.number().integer().positive().required().messages({
    'any.required': '班次ID不能为空',
    'number.base': '班次ID必须是数字'
  }),
  summary: Joi.string().min(1).max(1000).required().messages({
    'any.required': '交接摘要不能为空'
  }),
  operator: Joi.string().min(1).max(100).required().messages({
    'any.required': '操作人不能为空'
  })
});

export const getShiftHistorySchema = Joi.object({
  startTime: Joi.string().isoDate().optional().messages({
    'string.isoDate': '开始时间格式不正确，应为ISO格式'
  }),
  endTime: Joi.string().isoDate().optional().messages({
    'string.isoDate': '结束时间格式不正确，应为ISO格式'
  })
});

export const getDisposalStatisticsSchema = Joi.object({
  startTime: Joi.string().isoDate().optional().messages({
    'string.isoDate': '开始时间格式不正确，应为ISO格式'
  }),
  endTime: Joi.string().isoDate().optional().messages({
    'string.isoDate': '结束时间格式不正确，应为ISO格式'
  })
});
