import Joi from 'joi';

export const suggestionStatusEnum = ['pending', 'adopted', 'rejected'] as const;
export const suggestionPriorityEnum = ['high', 'medium', 'low'] as const;

export const zoneIdSchema = Joi.object({
  zoneId: Joi.number().integer().positive().required().messages({
    'any.required': '分区ID不能为空',
    'number.base': '分区ID必须是数字'
  })
});

export const forecastQuerySchema = Joi.object({
  date: Joi.string().isoDate().optional().messages({
    'string.isoDate': '日期格式必须为ISO标准日期'
  })
});

export const multiDayForecastQuerySchema = Joi.object({
  startDate: Joi.string().isoDate().required().messages({
    'any.required': '起始日期不能为空',
    'string.isoDate': '起始日期格式必须为ISO标准日期'
  }),
  endDate: Joi.string().isoDate().required().messages({
    'any.required': '截止日期不能为空',
    'string.isoDate': '截止日期格式必须为ISO标准日期'
  }),
  holidayFactor: Joi.number().min(0.5).max(2.0).default(1.0).messages({
    'number.min': '节假日系数不能小于0.5',
    'number.max': '节假日系数不能大于2.0'
  }),
  weatherFactor: Joi.number().min(0.5).max(2.0).default(1.0).messages({
    'number.min': '天气系数不能小于0.5',
    'number.max': '天气系数不能大于2.0'
  })
});

export const peakTrendQuerySchema = Joi.object({
  startDate: Joi.string().isoDate().required().messages({
    'any.required': '起始日期不能为空',
    'string.isoDate': '起始日期格式必须为ISO标准日期'
  }),
  endDate: Joi.string().isoDate().required().messages({
    'any.required': '截止日期不能为空',
    'string.isoDate': '截止日期格式必须为ISO标准日期'
  }),
  holidayFactor: Joi.number().min(0.5).max(2.0).default(1.0),
  weatherFactor: Joi.number().min(0.5).max(2.0).default(1.0)
});

export const suggestionIdSchema = Joi.object({
  suggestionId: Joi.number().integer().positive().required().messages({
    'any.required': '建议ID不能为空',
    'number.base': '建议ID必须是数字'
  })
});

export const suggestionListSchema = Joi.object({
  status: Joi.string().valid(...suggestionStatusEnum).optional().messages({
    'any.only': '建议状态只能是 pending, adopted, rejected'
  }),
  priority: Joi.string().valid(...suggestionPriorityEnum).optional().messages({
    'any.only': '建议优先级只能是 high, medium, low'
  })
});

export const updateSuggestionStatusSchema = Joi.object({
  status: Joi.string().valid(...suggestionStatusEnum).required().messages({
    'any.required': '状态不能为空',
    'any.only': '状态只能是 pending, adopted, rejected'
  })
});
