import { Request, Response, NextFunction } from 'express';
import { Schema } from 'joi';
import { createError } from './errorHandler';

export const validate = (schema: Schema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req[source], { abortEarly: false });
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return next(createError(400, `参数验证失败: ${JSON.stringify(errors)}`));
    }
    next();
  };
};
