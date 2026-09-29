import { Request, Response, NextFunction } from 'express';
import { ReportingService } from './reporting.service.js';
import {
  DailyAttendanceFilter,
  LateReturnFilter,
  LeaveReportFilter,
  VerificationFailureFilter,
} from './reporting.types.js';
import { AuditLogFilter } from '../audit/audit.types.js';

function isCsvRequested(req: Request): boolean {
  if (req.query.format === 'csv') return true;
  const accept = req.headers['accept'] || '';
  return accept.includes('text/csv');
}

export class ReportingController {
  constructor(private reportingService: ReportingService) {}

  /**
   * GET /admin/reports/daily-attendance
   */
  getDailyAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter: DailyAttendanceFilter = {
        hostelId: req.query.hostelId as string | undefined,
        date: req.query.date as string | undefined,
        status: req.query.status as string | undefined,
      };

      const report = await this.reportingService.getDailyAttendanceReport(filter);

      if (isCsvRequested(req)) {
        const csv = this.reportingService.exportDailyAttendanceCsv(report);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="daily-attendance-${report.curfewDate}.csv"`
        );
        res.status(200).send(csv);
        return;
      }

      res.status(200).json({ status: 'success', data: report });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /admin/reports/late-returns
   */
  getLateReturns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter: LateReturnFilter = {
        hostelId: req.query.hostelId as string | undefined,
        date: req.query.date as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
      };

      const report = await this.reportingService.getLateReturnReport(filter);

      if (isCsvRequested(req)) {
        const csv = this.reportingService.exportLateReturnCsv(report);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="late-returns-${report.startDate}.csv"`
        );
        res.status(200).send(csv);
        return;
      }

      res.status(200).json({ status: 'success', data: report });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /admin/reports/leaves
   */
  getLeaves = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter: LeaveReportFilter = {
        hostelId: req.query.hostelId as string | undefined,
        date: req.query.date as string | undefined,
        status: req.query.status as any,
        leaveType: req.query.leaveType as any,
      };

      const report = await this.reportingService.getLeaveReport(filter);

      if (isCsvRequested(req)) {
        const csv = this.reportingService.exportLeaveReportCsv(report);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="leave-report.csv"');
        res.status(200).send(csv);
        return;
      }

      res.status(200).json({ status: 'success', data: report });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /admin/reports/verification-failures
   */
  getVerificationFailures = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter: VerificationFailureFilter = {
        hostelId: req.query.hostelId as string | undefined,
        date: req.query.date as string | undefined,
        reason: req.query.reason as string | undefined,
      };

      const report = await this.reportingService.getVerificationFailureReport(filter);

      if (isCsvRequested(req)) {
        const csv = this.reportingService.exportVerificationFailureCsv(report);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="verification-failures.csv"'
        );
        res.status(200).send(csv);
        return;
      }

      res.status(200).json({ status: 'success', data: report });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /admin/reports/audit
   */
  getAuditReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter: AuditLogFilter = {
        targetEntity: req.query.targetEntity as string | undefined,
        targetId: req.query.targetId as string | undefined,
        action: req.query.action as string | undefined,
        actorId: req.query.actorId as string | undefined,
        actorRole: req.query.actorRole as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      if (isCsvRequested(req)) {
        const csv = await this.reportingService.exportAuditCsv(filter);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-log-export.csv"');
        res.status(200).send(csv);
        return;
      }

      const logs = await this.reportingService.getAuditReport(filter);
      res.status(200).json({ status: 'success', data: logs });
    } catch (err) {
      next(err);
    }
  };
}
