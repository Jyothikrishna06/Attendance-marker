import { IAdminRepository } from './admin.repository.js';
import { IAuthRepository } from '../auth/auth.repository.js';
import { IPresenceRepository } from '../presence/presence.repository.js';
import {
  CreateCurfewRuleInput,
  UpdateCurfewRuleInput,
  CurrentCurfewResponse,
  CurfewStatusFilters,
  CurfewStatusResponse,
  ResidentCurfewStatusItem,
  CurfewStatusSummary,
  EnrichedLeaveRequest,
  LeaveRequestFilter,
  UpdateLeaveStatusInput,
  RecordCorrectionInput,
  RecordCorrectionResponse,
  AuditLogFilter,
} from './admin.interface.js';
import {
  AccessTokenPayload,
  CurfewRule,
  AuditLog,
  PresenceEvent,
} from '../../common/types.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../common/errors.js';

export class AdminService {
  constructor(
    private adminRepo: IAdminRepository,
    private authRepo: IAuthRepository,
    private presenceRepo: IPresenceRepository
  ) {}

  /**
   * 1. GET /curfew/current
   * Returns current effective curfew rule for today.
   */
  async getCurrentCurfew(hostelId?: string, targetDate = new Date()): Promise<CurrentCurfewResponse> {
    const hostels = await this.adminRepo.getHostels();
    if (hostels.length === 0) {
      throw new NotFoundError('No active hostels registered in system');
    }

    let targetHostel = hostels[0];
    if (hostelId) {
      const found = await this.adminRepo.findHostelById(hostelId);
      if (!found) {
        throw new NotFoundError(`Hostel with ID ${hostelId} not found`);
      }
      targetHostel = found;
    }

    const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 6 = Saturday
    const rule = await this.adminRepo.findActiveCurfewRule(targetHostel.id, dayOfWeek);
    if (!rule) {
      throw new NotFoundError(`No active curfew rule found for hostel ${targetHostel.name}`);
    }

    const curfewDate = targetDate.toISOString().split('T')[0];
    const [hours, minutes, seconds] = rule.curfewTime.split(':').map((s) => parseInt(s, 10));

    const deadline = new Date(targetDate);
    deadline.setHours(hours || 21, minutes || 30, seconds || 0, 0);

    const graceDeadline = new Date(deadline.getTime() + rule.gracePeriodMinutes * 60 * 1000);

    return {
      ruleId: rule.id,
      hostelId: targetHostel.id,
      hostelName: targetHostel.name,
      curfewTime: rule.curfewTime,
      gracePeriodMinutes: rule.gracePeriodMinutes,
      curfewDeadline: deadline.toISOString(),
      graceDeadline: graceDeadline.toISOString(),
      dayOfWeek: rule.dayOfWeek,
      curfewDate,
    };
  }

  /**
   * 2. POST /admin/curfew
   * Create a new curfew policy rule.
   */
  async createCurfewRule(actor: AccessTokenPayload, input: CreateCurfewRuleInput): Promise<CurfewRule> {
    const hostel = await this.adminRepo.findHostelById(input.hostelId);
    if (!hostel) {
      throw new NotFoundError(`Hostel ${input.hostelId} not found`);
    }

    const rule = await this.adminRepo.createCurfewRule({
      hostelId: input.hostelId,
      dayOfWeek: input.dayOfWeek ?? null,
      curfewTime: input.curfewTime,
      gracePeriodMinutes: input.gracePeriodMinutes ?? 15,
      isActive: true,
      effectiveFrom: input.effectiveFrom || new Date().toISOString().split('T')[0],
      effectiveTo: input.effectiveTo || null,
    });

    const justification = input.justification?.trim() || 'Curfew rule created by warden/admin';

    await this.adminRepo.createAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'CURFEW_RULE_CREATED',
      targetEntity: 'curfew_rules',
      targetId: rule.id,
      previousState: null,
      newState: rule as unknown as Record<string, unknown>,
      reason: justification,
      ipAddress: null,
    });

    await this.adminRepo.createAdminAction({
      adminId: actor.userId,
      actionType: 'CURFEW_RULE_CHANGE',
      targetId: rule.id,
      details: { curfewTime: rule.curfewTime, gracePeriodMinutes: rule.gracePeriodMinutes },
      justification,
    });

    return rule;
  }

  /**
   * 3. PATCH /admin/curfew/:id
   * Update an existing curfew rule.
   */
  async updateCurfewRule(actor: AccessTokenPayload, id: string, input: UpdateCurfewRuleInput): Promise<CurfewRule> {
    const existing = await this.adminRepo.findCurfewRuleById(id);
    if (!existing) {
      throw new NotFoundError(`Curfew rule ${id} not found`);
    }

    const previousState = { ...existing };
    const updated = await this.adminRepo.updateCurfewRule(id, {
      curfewTime: input.curfewTime ?? existing.curfewTime,
      gracePeriodMinutes: input.gracePeriodMinutes ?? existing.gracePeriodMinutes,
      dayOfWeek: input.dayOfWeek !== undefined ? input.dayOfWeek : existing.dayOfWeek,
      isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
      effectiveTo: input.effectiveTo !== undefined ? input.effectiveTo : existing.effectiveTo,
    });

    const justification = input.justification?.trim() || 'Curfew rule amended by warden/admin';

    await this.adminRepo.createAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'CURFEW_RULE_UPDATED',
      targetEntity: 'curfew_rules',
      targetId: id,
      previousState: previousState as unknown as Record<string, unknown>,
      newState: updated as unknown as Record<string, unknown>,
      reason: justification,
      ipAddress: null,
    });

    return updated;
  }

  /**
   * 4. GET /admin/curfew/status
   * Live curfew roster, status breakdown, and verification failure alerts.
   */
  async getCurfewStatus(filters: CurfewStatusFilters = {}): Promise<CurfewStatusResponse> {
    const residents = await this.authRepo.getAllResidents();
    const hostels = await this.adminRepo.getHostels();
    const rooms = await this.adminRepo.getRooms();
    const users = await this.authRepo.getAllUsers();
    const attempts = await this.presenceRepo.getAllVerificationAttempts();

    const hostelMap = new Map(hostels.map((h) => [h.id, h]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const now = new Date();
    const roster: ResidentCurfewStatusItem[] = [];

    let totalTracked = 0;
    let verifiedInside = 0;
    let verifiedOutside = 0;
    let approvedLeave = 0;
    let pendingVerification = 0;
    let verificationFailed = 0;

    for (const resident of residents) {
      const user = userMap.get(resident.userId);
      if (!user || user.status !== 'ACTIVE') continue;

      const hostel = hostelMap.get(resident.hostelId);
      const room = roomMap.get(resident.roomId);
      const activeDevice = await this.authRepo.findActiveDeviceByResidentId(resident.id);
      const activeLeave = await this.adminRepo.findActiveLeaveForResident(resident.id, now);
      const latestPresence = await this.presenceRepo.findLatestPresenceEvent(resident.id);

      // Check for recent failed verification attempt
      const residentAttempts = attempts.filter((a) => a.residentId === resident.id);
      const latestAttempt = residentAttempts.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )[0];

      let failureAlert: ResidentCurfewStatusItem['failureAlert'] = null;
      if (latestAttempt && (latestAttempt.status === 'FAILED' || latestAttempt.status === 'REJECTED')) {
        failureAlert = {
          attemptId: latestAttempt.id,
          failureReason: latestAttempt.failureReason || 'Verification check failed',
          timestamp: latestAttempt.createdAt.toISOString(),
        };
      }

      // Resolve final status
      let currentStatus: ResidentCurfewStatusItem['currentStatus'] = 'PENDING_VERIFICATION';
      if (activeLeave) {
        currentStatus = 'APPROVED_LEAVE';
      } else if (latestPresence) {
        if (latestPresence.eventType === 'ENTRY' && latestPresence.status === 'VERIFIED_INSIDE') {
          currentStatus = 'VERIFIED_INSIDE';
        } else if (latestPresence.eventType === 'EXIT' && latestPresence.status === 'VERIFIED_OUTSIDE') {
          currentStatus = 'VERIFIED_OUTSIDE';
        } else if (latestPresence.status === 'FLAGGED') {
          currentStatus = 'VERIFICATION_FAILED';
        }
      } else if (failureAlert) {
        currentStatus = 'VERIFICATION_FAILED';
      }

      totalTracked++;
      switch (currentStatus) {
        case 'VERIFIED_INSIDE':
          verifiedInside++;
          break;
        case 'VERIFIED_OUTSIDE':
          verifiedOutside++;
          break;
        case 'APPROVED_LEAVE':
          approvedLeave++;
          break;
        case 'VERIFICATION_FAILED':
          verificationFailed++;
          break;
        case 'PENDING_VERIFICATION':
          pendingVerification++;
          break;
      }

      const item: ResidentCurfewStatusItem = {
        residentId: resident.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        rollNumber: resident.rollNumber,
        hostelId: resident.hostelId,
        hostelName: hostel?.name || 'Unknown Hostel',
        hostelCode: hostel?.code || 'N/A',
        roomId: resident.roomId,
        roomNumber: room?.roomNumber || 'N/A',
        floor: room?.floor ?? 0,
        currentStatus,
        lastEventType: latestPresence?.eventType || null,
        lastSeen: latestPresence?.serverTimestamp.toISOString() || null,
        activeDeviceId: activeDevice?.id || null,
        activeDeviceModel: activeDevice?.deviceModel || null,
        failureAlert,
        activeLeave: activeLeave
          ? {
              id: activeLeave.id,
              leaveType: activeLeave.leaveType,
              endTime: activeLeave.endTime.toISOString(),
            }
          : null,
        emergencyContact: {
          name: resident.emergencyContactName,
          phone: resident.emergencyContactPhone,
        },
      };

      roster.push(item);
    }

    // Apply Filters
    let filteredRoster = roster;
    if (filters.hostelId) {
      filteredRoster = filteredRoster.filter(
        (r) => r.hostelId === filters.hostelId || r.hostelCode.toLowerCase() === filters.hostelId!.toLowerCase()
      );
    }
    if (filters.floor !== undefined) {
      filteredRoster = filteredRoster.filter((r) => r.floor === Number(filters.floor));
    }
    if (filters.roomNumber) {
      filteredRoster = filteredRoster.filter((r) =>
        r.roomNumber.toLowerCase().includes(filters.roomNumber!.toLowerCase())
      );
    }
    if (filters.status) {
      filteredRoster = filteredRoster.filter(
        (r) => r.currentStatus.toLowerCase() === filters.status!.toLowerCase()
      );
    }

    const summary: CurfewStatusSummary = {
      totalTracked,
      verifiedInside,
      verifiedOutside,
      approvedLeave,
      pendingVerification,
      verificationFailed,
    };

    return {
      summary,
      roster: filteredRoster,
      timestamp: now.toISOString(),
    };
  }

  /**
   * 5. GET /admin/leave
   * Returns list of leave requests with resident & room details.
   */
  async getLeaveRequests(filter: LeaveRequestFilter = {}): Promise<EnrichedLeaveRequest[]> {
    const leaves = await this.adminRepo.getLeaveRequests(filter);
    const residents = await this.authRepo.getAllResidents();
    const users = await this.authRepo.getAllUsers();
    const hostels = await this.adminRepo.getHostels();
    const rooms = await this.adminRepo.getRooms();

    const residentMap = new Map(residents.map((r) => [r.id, r]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const hostelMap = new Map(hostels.map((h) => [h.id, h]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));

    const enriched: EnrichedLeaveRequest[] = [];
    for (const leave of leaves) {
      const resident = residentMap.get(leave.residentId);
      if (!resident) continue;

      if (filter.hostelId && resident.hostelId !== filter.hostelId) {
        continue;
      }

      const user = userMap.get(resident.userId);
      const hostel = hostelMap.get(resident.hostelId);
      const room = roomMap.get(resident.roomId);

      enriched.push({
        ...leave,
        residentName: user?.name || 'Unknown Resident',
        residentEmail: user?.email || '',
        rollNumber: resident.rollNumber,
        roomNumber: room?.roomNumber || 'N/A',
        hostelName: hostel?.name || 'N/A',
        hostelCode: hostel?.code || 'N/A',
      });
    }

    return enriched;
  }

  /**
   * 6. PATCH /admin/leave/:id
   * Approve or reject a leave request with mandatory decision reason.
   */
  async updateLeaveStatus(
    actor: AccessTokenPayload,
    id: string,
    input: UpdateLeaveStatusInput
  ): Promise<EnrichedLeaveRequest> {
    if (!input.decisionReason || !input.decisionReason.trim()) {
      throw new ValidationError(
        'Mandatory non-empty decision reason is required for leave adjudication.',
        { field: 'decisionReason', code: 'MANDATORY_REASON_REQUIRED' }
      );
    }

    const leave = await this.adminRepo.findLeaveRequestById(id);
    if (!leave) {
      throw new NotFoundError(`Leave request with ID ${id} not found`);
    }

    const previousState = { ...leave };
    const trimmedReason = input.decisionReason.trim();

    const updated = await this.adminRepo.updateLeaveRequest(id, {
      status: input.status,
      approverId: actor.userId,
      decisionReason: trimmedReason,
      decisionTimestamp: new Date(),
    });

    // Create immutable audit log
    await this.adminRepo.createAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: `LEAVE_${input.status}`,
      targetEntity: 'leave_requests',
      targetId: id,
      previousState: previousState as unknown as Record<string, unknown>,
      newState: updated as unknown as Record<string, unknown>,
      reason: trimmedReason,
      ipAddress: null,
    });

    const [enriched] = await this.getLeaveRequests({ residentId: leave.residentId });
    return enriched || {
      ...updated,
      residentName: 'Resident',
      residentEmail: '',
      rollNumber: '',
      roomNumber: '',
      hostelName: '',
      hostelCode: '',
    };
  }

  /**
   * 7. POST /admin/presence/correct
   * Transactionally correct a presence record with mandatory reason string.
   */
  async correctPresenceRecord(
    actor: AccessTokenPayload,
    input: RecordCorrectionInput,
    ipAddress?: string
  ): Promise<RecordCorrectionResponse> {
    if (!input.reason || !input.reason.trim()) {
      throw new ValidationError(
        'Mandatory non-empty justification reason is required to commit a presence record correction.',
        { field: 'reason', code: 'MANDATORY_REASON_REQUIRED' }
      );
    }

    const trimmedReason = input.reason.trim();
    const resident = await this.authRepo.findResidentById(input.residentId);
    if (!resident) {
      throw new NotFoundError(`Resident profile ${input.residentId} not found`);
    }

    const source = actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN'
      ? 'ADMIN_OVERRIDE'
      : 'WARDEN_MANUAL';

    let event: PresenceEvent;
    let previousStatus = 'UNKNOWN';

    if (input.eventId) {
      const existing = await this.presenceRepo.findPresenceEventById(input.eventId);
      if (!existing) {
        throw new NotFoundError(`Presence event ${input.eventId} not found`);
      }
      previousStatus = existing.status;
      event = await this.presenceRepo.updatePresenceEvent(input.eventId, {
        status: input.status,
        source,
      });
    } else {
      // Find latest event to derive previous status
      const latest = await this.presenceRepo.findLatestPresenceEvent(resident.id);
      if (latest) {
        previousStatus = latest.status;
      }

      const eventType = input.status === 'VERIFIED_INSIDE' ? 'ENTRY' : 'EXIT';
      const now = new Date();
      event = await this.presenceRepo.createPresenceEvent({
        residentId: resident.id,
        eventType,
        source,
        serverTimestamp: now,
        curfewDate: input.curfewDate || now.toISOString().split('T')[0],
        status: input.status,
        networkEvidence: { correctionReason: trimmedReason, correctedBy: actor.userId },
      });
    }

    // Transactionally create immutable audit log
    const auditLog = await this.adminRepo.createAuditLog({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'RECORD_CORRECTION',
      targetEntity: 'presence_events',
      targetId: event.id,
      previousState: { status: previousStatus },
      newState: { status: input.status, source },
      reason: trimmedReason,
      ipAddress: ipAddress || null,
    });

    return {
      eventId: event.id,
      residentId: resident.id,
      previousStatus,
      newStatus: event.status,
      source: event.source,
      serverTimestamp: event.serverTimestamp.toISOString(),
      reason: trimmedReason,
      auditLogId: auditLog.id,
    };
  }

  /**
   * 8. GET /admin/audit
   * Query immutable audit history.
   */
  async getAuditLogs(filter: AuditLogFilter = {}): Promise<AuditLog[]> {
    return this.adminRepo.getAuditLogs(filter);
  }
}
