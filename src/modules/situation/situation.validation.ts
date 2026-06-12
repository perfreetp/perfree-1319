import Joi from 'joi';

export const zoneIdParamSchema = Joi.object({
  zoneId: Joi.number().integer().positive().required().messages({
    'number.base': '分区ID必须为数字',
    'number.integer': '分区ID必须为整数',
    'number.positive': '分区ID必须为正整数',
    'any.required': '分区ID不能为空'
  })
});

export const zoneMonitorBodySchema = Joi.object({
  zoneId: Joi.number().integer().positive().required().messages({
    'number.base': '分区ID必须为数字',
    'number.integer': '分区ID必须为整数',
    'number.positive': '分区ID必须为正整数',
    'any.required': '分区ID不能为空'
  }),
  flowRate: Joi.number().positive().required().messages({
    'number.base': '流量必须为数字',
    'number.positive': '流量必须为正数',
    'any.required': '流量不能为空'
  }),
  pressure: Joi.number().positive().required().messages({
    'number.base': '水压必须为数字',
    'number.positive': '水压必须为正数',
    'any.required': '水压不能为空'
  })
});
