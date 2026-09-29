import {
  CurfewEvaluationOptions,
  HostelCurfewEvaluationResult,
  ResidentEvaluationResult,
  CurfewEvaluationContext,
  CurfewEvaluationSummary,
} from './curfew-evaluation.types.js';
import { constructCurfewDeadlines, evaluateResidentCurfew } from './curfew-evaluation.engine.js';
import { ICurfewEvaluationRepository } from './curfew-evaluation.repository.js';
import { IAdminRepository } from '../admin/admin.repository.js';
import { IAuthRepository } from '../auth/auth.repository.js';
import { IPresenceRepository } from '../presence/presence.repository.js';
import { NotFoundError } from '../../common/errors.js';

export class CurfewEvaluationService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private adminRepo: IAdminRepository,
    private authRepo: IAuthRepository,
    private presenceRepo: IPresenceRepository,
    private curfewEvaluationRepo: ICurfewEvaluationRepository
  ) {}

  /**
   * Deterministically evaluates curfew presence statuses for all residents of a hostel.
   * Can be executed on-demand (e.g., via API endpoint or warden console) or on a schedule.
   */
  async evaluateHostelCurfew(
    options: CurfewEvaluationOptions
  ): Promise<HostelCurfewEvaluationResult> {
    const { hostelId } = options;

    const hostel = await this.adminRepo.findHostelById(hostelId);
    if (!hostel) {
      throw new NotFoundError(`Hostel with ID ${hostelId} not found`);
    }

    const evaluationTime = options.evaluationTime || new Date();
    const dateStr = options.date || evaluationTime.toISOString().split('T')[0];
    const timezone = options.timezone || '+05:30';

    // 1. Calculate Curfew Deadlines
    // First, derive dayOfWeek for curfew rule lookup
    const { dayOfWeek } = constructCurfewDeadlines(dateStr, '21:30:00', 15, timezone);
    const rule = await this.adminRepo.findActiveCurfewRule(hostelId, dayOfWeek);
    if (!rule) {
      throw new NotFoundError(`No active curfew rule found for hostel ${hostel.name} on date ${dateStr}`);
    }

    const { curfewDeadline, graceDeadline, normalizedTz } = constructCurfewDeadlines(
      dateStr,
      rule.curfewTime,
      rule.gracePeriodMinutes,
      timezone
    );

    const context: CurfewEvaluationContext = {
      hostelId,
      date: dateStr,
      curfewRule: rule,
      curfewDeadline,
      graceDeadline,
      evaluationTime,
      timezone: normalizedTz,
    };

    // 2. Fetch Residents, Presence Events, Attempts, and Leaves
    const allResidents = await this.authRepo.getAllResidents();
    const hostelResidents = allResidents.filter((r) => r.hostelId === hostelId);

    const allLeaves = await this.adminRepo.getLeaveRequests();
    const allAttempts = await this.presenceRepo.getAllVerificationAttempts();

    const results: ResidentEvaluationResult[] = [];

    let totalResidents = 0;
    let verifiedInside = 0;
    let approvedLeave = 0;
    let pendingVerification = 0;
    let notVerified = 0;
    let verificationFailed = 0;

    for (const resident of hostelResidents) {
      totalResidents++;

      // Relevant leaves for resident
      const residentLeaves = allLeaves.filter((l) => l.residentId === resident.id);

      // Relevant presence events for resident
      const residentEvents = await this.presenceRepo.findPresenceEventsByResidentId(resident.id, 50);

      // Relevant verification attempts
      const residentAttempts = allAttempts.filter((a) => a.residentId === resident.id);

      // Run deterministic evaluation engine
      const evalResult = evaluateResidentCurfew(context, {
        residentId: resident.id,
        leaveRequests: residentLeaves,
        presenceEvents: residentEvents,
        verificationAttempts: residentAttempts,
      });

      results.push(evalResult);

      switch (evalResult.status) {
        case 'VERIFIED_INSIDE':
          verifiedInside++;
          break;
        case 'APPROVED_LEAVE':
          approvedLeave++;
          break;
        case 'PENDING_VERIFICATION':
          pendingVerification++;
          break;
        case 'NOT_VERIFIED':
          notVerified++;
          break;
        case 'VERIFICATION_FAILED':
          verificationFailed++;
          break;
      }
    }

    // 3. Persist Evaluation Results (if persist is true, default true)
    if (options.persist !== false) {
      await this.curfewEvaluationRepo.saveEvaluationResults(hostelId, results);
    }

    const summary: CurfewEvaluationSummary = {
      totalResidents,
      verifiedInside,
      approvedLeave,
      pendingVerification,
      notVerified,
      verificationFailed,
    };

    return {
      hostelId,
      hostelName: hostel.name,
      curfewDate: dateStr,
      curfewDeadline: curfewDeadline.toISOString(),
      graceDeadline: graceDeadline.toISOString(),
      evaluatedAt: evaluationTime.toISOString(),
      timezone: normalizedTz,
      summary,
      results,
    };
  }

  /**
   * Fetches persisted evaluation records for a specific hostel and date
   */
  async getEvaluationHistory(hostelId: string, curfewDate: string) {
    return this.curfewEvaluationRepo.findEvaluationsByHostelAndDate(hostelId, curfewDate);
  }

  /**
   * Starts periodic background curfew evaluation job
   */
  startBackgroundEvaluationCron(intervalMs = 60000): void {
    if (this.timer) return;

    this.timer = setInterval(async () => {
      try {
        const hostels = await this.adminRepo.getHostels();
        for (const hostel of hostels) {
          if (hostel.isActive) {
            await this.evaluateHostelCurfew({ hostelId: hostel.id });
          }
        }
      } catch (err) {
        console.error('Background curfew evaluation cycle encountered error:', err);
      }
    }, intervalMs);
  }

  /**
   * Stops background evaluation cron
   */
  stopBackgroundEvaluationCron(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
