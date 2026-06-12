import Joi from 'joi';

export const pumpListSchema = Joi.object({
  stationId: Joi.number().integer().positive().optional()
});

export const pumpIdSchema = Joi.object({
  pumpId: Joi.number().integer().positive().required()
});

export const requestIdSchema = Joi.object({
  requestId: Joi.number().integer().positive().required()
});

export const pumpHistorySchema = Joi.object({
  pumpId: Joi.number().integer().positive().required()
}).concat(Joi.object({
  startTime: Joi.string().isoDate().optional(),
  endTime: Joi.string().isoDate().optional()
}));

export const pumpHistoryQuerySchema = Joi.object({
  startTime: Joi.string().isoDate().optional(),
  endTime: Joi.string().isoDate().optional()
});

export const createPumpRequestSchema = Joi.object({
  pumpId: Joi.number().integer().positive().required(),
  requestType: Joi.string().valid('start', 'stop').required(),
  reason: Joi.string().max(500).optional(),
  requester: Joi.string().min(1).max(100).required()
});

export const pumpRequestListSchema = Joi.object({
  status: Joi.string().valid('pending', 'approved', 'rejected').optional()
});

export const approvePumpRequestSchema = Joi.object({
  requestId: Joi.number().integer().positive().required()
}).concat(Joi.object({
  approver: Joi.string().min(1).max(100).required(),
  opinion: Joi.string().max(500).optional(),
  approved: Joi.boolean().required()
}));

export const approvePumpRequestBodySchema = Joi.object({
  approver: Joi.string().min(1).max(100).required(),
  opinion: Joi.string().max(500).optional(),
  approved: Joi.boolean().required()
});

export const addPumpControlSchema = Joi.object({
  pumpId: Joi.number().integer().positive().required(),
  flowRate: Joi.number().min(0).required(),
  pressure: Joi.number().min(0).required(),
  power: Joi.number().min(0).required(),
  requestId: Joi.number().integer().positive().optional(),
  operator: Joi.string().min(1).max(100).optional()
});
