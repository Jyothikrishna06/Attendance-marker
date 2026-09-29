import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CurfewEvaluationService } from './curfew-evaluation.service.js';
import { ValidationError, UnauthorizedError } from '../../common/errors.js';

export const evaluateCurfewSchema = z.object({
  hostelId: z.string().uuid({ message: 'Valid hostelId UUID is required' }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' }).optional(),
  timezone: z.string().optional(),
});

export class CurfewEvaluationController {
  constructor(private curfewEvaluationService: CurfewEvaluationService) {}

  /**
   * POST /admin/curfew/evaluate
   */
  evaluateCurfew = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();

      const parseResult = evaluateCurfewSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid evaluation request payload', parseResult.error.flatten().fieldErrors);
      }

      const result = await this.curfewEvaluationService.evaluateHostelCurfew({
        hostelId: parseResult.data.hostelId,
        date: parseResult.data.date,
        timezone: parseResult.data.timezone,
        persist: true,
      });

      res.status(200).json({
        data: result,
        message: 'Curfew evaluation completed and persisted successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /admin/curfew/evaluation
   */
  getEvaluationHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();

      const hostelId = req.query.hostelId ? String(req.query.hostelId) : undefined;
      const date = req.query.date ? String(req.query.date) : new Date().toISOString().split('T')[0];

      if (!hostelId) {
        throw new ValidationError('hostelId query parameter is required');
      }

      const records = await this.curfewEvaluationService.getEvaluationHistory(hostelId, date);
      res.status(200).json({
        data: records,
        total: records.length,
      });
    } catch (err) {
      next(err);
    }
  };
}
