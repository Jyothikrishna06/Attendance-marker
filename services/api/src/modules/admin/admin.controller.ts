import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AdminService } from './admin.service.js';
import { ValidationError, UnauthorizedError } from '../../common/errors.js';

const curfewTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export const createCurfewSchema = z.object({
  hostelId: z.string().uuid({ message: 'Valid hostelId UUID is required' }),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  curfewTime: z.string().regex(curfewTimeRegex, { message: 'Curfew time must be in HH:MM or HH:MM:SS format (e.g. 21:30:00)' }),
  gracePeriodMinutes: z.number().int().min(0).max(120).optional().default(15),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().nullable().optional(),
  justification: z.string().optional(),
});

export const updateCurfewSchema = z.object({
  curfewTime: z.string().regex(curfewTimeRegex, { message: 'Curfew time must be in HH:MM or HH:MM:SS format' }).optional(),
  gracePeriodMinutes: z.number().int().min(0).max(120).optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  isActive: z.boolean().optional(),
  effectiveTo: z.string().nullable().optional(),
  justification: z.string().optional(),
});

export const updateLeaveSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED'], { message: "Status must be either 'APPROVED' or 'REJECTED'" }),
  decisionReason: z.string().min(1, { message: 'Mandatory non-empty decision reason is required' }),
});

export const correctRecordSchema = z.object({
  eventId: z.string().uuid().optional(),
  residentId: z.string().uuid({ message: 'Valid residentId UUID is required' }),
  status: z.enum(['VERIFIED_INSIDE', 'VERIFIED_OUTSIDE', 'FLAGGED'], {
    message: "Status must be 'VERIFIED_INSIDE', 'VERIFIED_OUTSIDE', or 'FLAGGED'",
  }),
  curfewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().min(1, { message: 'Mandatory non-empty justification reason is required to correct record' }),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  reason: z.string().min(1, { message: 'Mandatory non-empty justification reason is required' }),
});

export const revokeDeviceSchema = z.object({
  reason: z.string().min(1, { message: 'Mandatory non-empty justification reason is required' }),
});

export class AdminController {
  constructor(private adminService: AdminService) {}

  /**
   * GET /curfew/current
   */
  getCurrentCurfew = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const hostelId = req.query.hostelId ? String(req.query.hostelId) : undefined;
      const curfew = await this.adminService.getCurrentCurfew(hostelId);
      res.status(200).json({
        data: curfew,
        message: 'Current curfew policy retrieved successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /admin/curfew
   */
  createCurfewRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parseResult = createCurfewSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid curfew rule payload', parseResult.error.flatten().fieldErrors);
      }

      const rule = await this.adminService.createCurfewRule(req.user, parseResult.data);
      res.status(201).json({
        data: rule,
        message: 'Curfew rule created successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /admin/curfew/:id
   */
  updateCurfewRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = req.params.id;
      if (!id) {
        throw new ValidationError('Curfew rule ID parameter is required');
      }

      const parseResult = updateCurfewSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid update payload', parseResult.error.flatten().fieldErrors);
      }

      const updated = await this.adminService.updateCurfewRule(req.user, id, parseResult.data);
      res.status(200).json({
        data: updated,
        message: 'Curfew rule updated successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /admin/curfew/status
   */
  getCurfewStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = {
        hostelId: req.query.hostelId ? String(req.query.hostelId) : undefined,
        floor: req.query.floor !== undefined ? parseInt(String(req.query.floor), 10) : undefined,
        roomNumber: req.query.roomNumber ? String(req.query.roomNumber) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
      };

      const result = await this.adminService.getCurfewStatus(filters);
      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /admin/leave
   */
  getLeaveRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter = {
        status: req.query.status as any,
        residentId: req.query.residentId ? String(req.query.residentId) : undefined,
        hostelId: req.query.hostelId ? String(req.query.hostelId) : undefined,
      };

      const leaves = await this.adminService.getLeaveRequests(filter);
      res.status(200).json({
        data: leaves,
        total: leaves.length,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /admin/leave/:id
   */
  updateLeaveStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = req.params.id;
      if (!id) {
        throw new ValidationError('Leave request ID parameter is required');
      }

      const parseResult = updateLeaveSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid leave adjudication payload', parseResult.error.flatten().fieldErrors);
      }

      const updated = await this.adminService.updateLeaveStatus(req.user, id, parseResult.data);
      res.status(200).json({
        data: updated,
        message: `Leave request ${parseResult.data.status.toLowerCase()} successfully`,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /admin/presence/correct
   * (Also supports PATCH /admin/presence/:id/correct)
   */
  correctRecord = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      
      const payload = {
        ...req.body,
        eventId: req.params.id || req.body.eventId,
      };

      const parseResult = correctRecordSchema.safeParse(payload);
      if (!parseResult.success) {
        throw new ValidationError('Invalid record correction payload', parseResult.error.flatten().fieldErrors);
      }

      const result = await this.adminService.correctPresenceRecord(
        req.user,
        parseResult.data,
        req.ip
      );

      res.status(200).json({
        data: result,
        message: 'Presence record corrected successfully with immutable audit log committed',
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /admin/audit
   */
  getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter = {
        targetEntity: req.query.targetEntity ? String(req.query.targetEntity) : undefined,
        action: req.query.action ? String(req.query.action) : undefined,
        actorId: req.query.actorId ? String(req.query.actorId) : undefined,
        limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 50,
        offset: req.query.offset ? parseInt(String(req.query.offset), 10) : 0,
      };

      const logs = await this.adminService.getAuditLogs(filter);
      res.status(200).json({
        data: logs,
        total: logs.length,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /admin/users/:id/status
   */
  updateUserStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parseResult = updateUserStatusSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid status update payload', parseResult.error.flatten().fieldErrors);
      }
      const updated = await this.adminService.updateUserStatus(
        req.user,
        req.params.id,
        parseResult.data.status,
        parseResult.data.reason,
        req.ip
      );
      res.status(200).json({
        data: updated,
        message: `User status successfully updated to ${updated.status}`,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /admin/devices/:id/revoke
   */
  revokeDevice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parseResult = revokeDeviceSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid device revocation payload', parseResult.error.flatten().fieldErrors);
      }
      const updated = await this.adminService.revokeDevice(
        req.user,
        req.params.id,
        parseResult.data.reason,
        req.ip
      );
      res.status(200).json({
        data: updated,
        message: 'Device revoked successfully with immutable audit log committed',
      });
    } catch (err) {
      next(err);
    }
  };
}
