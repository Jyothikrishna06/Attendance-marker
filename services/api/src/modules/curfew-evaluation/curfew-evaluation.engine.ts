import {
  CurfewEvaluationContext,
  ResidentEvaluationInput,
  ResidentEvaluationResult,
} from './curfew-evaluation.types.js';
import { LeaveRequest, PresenceEvent, VerificationAttempt } from '../../common/types.js';

/**
 * Normalizes timezone string to ISO offset format (e.g. "+05:30", "+00:00", "-04:00")
 */
export function normalizeTimezoneOffset(tz?: string): string {
  if (!tz) return '+05:30'; // Default IST for campus system

  const upper = tz.trim().toUpperCase();
  if (upper === 'UTC' || upper === 'Z' || upper === 'GMT') {
    return '+00:00';
  }
  if (upper === 'ASIA/KOLKATA' || upper === 'IST') {
    return '+05:30';
  }
  if (upper === 'AMERICA/NEW_YORK' || upper === 'EDT') {
    return '-04:00';
  }
  if (upper === 'EST') {
    return '-05:00';
  }

  // If already formatted like +05:30 or -04:00
  if (/^[+-]\d{2}:\d{2}$/.test(tz.trim())) {
    return tz.trim();
  }

  return '+05:30';
}

/**
 * Deterministically constructs UTC Date instances for curfew and grace deadlines
 * based on a calendar date string (YYYY-MM-DD), curfew time (HH:MM or HH:MM:SS),
 * grace period minutes, and timezone offset.
 */
export function constructCurfewDeadlines(
  dateStr: string,
  curfewTime: string,
  gracePeriodMinutes = 15,
  timezone = '+05:30'
): { curfewDeadline: Date; graceDeadline: Date; dayOfWeek: number; normalizedTz: string } {
  const normalizedTz = normalizeTimezoneOffset(timezone);

  // Normalize curfew time to HH:MM:SS
  const parts = curfewTime.trim().split(':');
  const hh = parts[0].padStart(2, '0');
  const mm = (parts[1] || '00').padStart(2, '0');
  const ss = (parts[2] || '00').padStart(2, '0');
  const formattedTime = `${hh}:${mm}:${ss}`;

  // Construct ISO timestamp with explicit timezone offset
  const isoStr = `${dateStr}T${formattedTime}${normalizedTz}`;
  const curfewDeadline = new Date(isoStr);

  if (isNaN(curfewDeadline.getTime())) {
    throw new Error(`Invalid date/time/timezone combination: date=${dateStr}, time=${curfewTime}, tz=${timezone}`);
  }

  const graceDeadline = new Date(curfewDeadline.getTime() + gracePeriodMinutes * 60 * 1000);

  // Compute dayOfWeek (0 = Sunday, 6 = Saturday) for dateStr
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();

  return { curfewDeadline, graceDeadline, dayOfWeek, normalizedTz };
}

/**
 * Checks if an approved leave request covers the curfew enforcement window
 */
export function isLeaveActiveDuringCurfew(
  leave: LeaveRequest,
  curfewDeadline: Date,
  graceDeadline: Date
): boolean {
  if (leave.status !== 'APPROVED') {
    return false;
  }

  // The leave must overlap with the curfew window [curfewDeadline, graceDeadline]
  const leaveStart = new Date(leave.startTime).getTime();
  const leaveEnd = new Date(leave.endTime).getTime();

  return leaveStart <= graceDeadline.getTime() && leaveEnd >= curfewDeadline.getTime();
}

/**
 * Pure, deterministic evaluation engine for a single resident's curfew status.
 */
export function evaluateResidentCurfew(
  context: CurfewEvaluationContext,
  input: ResidentEvaluationInput
): ResidentEvaluationResult {
  const { curfewDeadline, graceDeadline, evaluationTime, date } = context;
  const { residentId, leaveRequests, presenceEvents, verificationAttempts } = input;

  // 1. Check Approved Leave Requests
  const matchingLeave = leaveRequests.find((l) =>
    isLeaveActiveDuringCurfew(l, curfewDeadline, graceDeadline)
  );

  if (matchingLeave) {
    return {
      residentId,
      status: 'APPROVED_LEAVE',
      statusReason: `Resident is on approved ${matchingLeave.leaveType} leave (valid until ${new Date(matchingLeave.endTime).toISOString()})`,
      curfewDate: date,
      curfewDeadline,
      graceDeadline,
      evaluatedAt: evaluationTime,
      isLateReturn: false,
      resolvedLeaveId: matchingLeave.id,
      resolvedEventId: null,
    };
  }

  // 2. Sort and Process Presence Events Chronologically
  // Duplicate presence events are sorted and resolved in temporal sequence
  const sortedEvents = [...presenceEvents].sort(
    (a, b) => new Date(a.serverTimestamp).getTime() - new Date(b.serverTimestamp).getTime()
  );

  // Find all events occurring on or before the grace deadline
  const eventsBeforeGrace = sortedEvents.filter(
    (e) => new Date(e.serverTimestamp).getTime() <= graceDeadline.getTime()
  );

  // Events occurring strictly after the grace deadline (potential late returns)
  const eventsAfterGrace = sortedEvents.filter(
    (e) => new Date(e.serverTimestamp).getTime() > graceDeadline.getTime()
  );

  // Trace presence state as of graceDeadline
  let isInsideAtGrace = false;
  let lastEntryBeforeGrace: PresenceEvent | null = null;
  let isFlaggedBeforeGrace = false;
  let flaggedEvent: PresenceEvent | null = null;

  for (const event of eventsBeforeGrace) {
    if (event.status === 'FLAGGED') {
      isFlaggedBeforeGrace = true;
      flaggedEvent = event;
    } else if (event.eventType === 'ENTRY' && event.status === 'VERIFIED_INSIDE') {
      isInsideAtGrace = true;
      lastEntryBeforeGrace = event;
      isFlaggedBeforeGrace = false; // Resolved by subsequent valid entry
    } else if (event.eventType === 'EXIT' && event.status === 'VERIFIED_OUTSIDE') {
      isInsideAtGrace = false;
    }
  }

  // 3. Check for Verification Attempt Failures
  // Filter attempts relevant to this curfew date/window
  const relevantAttempts = verificationAttempts.filter((a) => {
    const attemptTime = new Date(a.challengeIssuedAt || a.createdAt).getTime();
    // Look within a reasonable window (e.g. within 12 hours of curfew)
    const windowStart = curfewDeadline.getTime() - 12 * 3600 * 1000;
    const windowEnd = graceDeadline.getTime() + 6 * 3600 * 1000;
    return attemptTime >= windowStart && attemptTime <= windowEnd;
  });

  const latestFailedAttempt = relevantAttempts
    .filter((a) => a.status === 'FAILED' || a.status === 'REJECTED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  // 4. Resolve Curfew State
  if (isFlaggedBeforeGrace && flaggedEvent) {
    return {
      residentId,
      status: 'VERIFICATION_FAILED',
      statusReason: 'Presence event was flagged as suspicious or anomalous by warden/system',
      curfewDate: date,
      curfewDeadline,
      graceDeadline,
      evaluatedAt: evaluationTime,
      isLateReturn: false,
      resolvedEventId: flaggedEvent.id,
      resolvedLeaveId: null,
    };
  }

  if (isInsideAtGrace && lastEntryBeforeGrace) {
    return {
      residentId,
      status: 'VERIFIED_INSIDE',
      statusReason: `Resident verified inside hostel at ${new Date(lastEntryBeforeGrace.serverTimestamp).toISOString()} (prior to curfew grace deadline)`,
      curfewDate: date,
      curfewDeadline,
      graceDeadline,
      evaluatedAt: evaluationTime,
      isLateReturn: false,
      resolvedEventId: lastEntryBeforeGrace.id,
      resolvedLeaveId: null,
    };
  }

  // If not verified inside before grace: did they return late?
  const firstLateEntry = eventsAfterGrace.find(
    (e) => e.eventType === 'ENTRY' && e.status === 'VERIFIED_INSIDE'
  );

  if (firstLateEntry) {
    const lateTimestamp = new Date(firstLateEntry.serverTimestamp).getTime();
    const lateMinutes = Math.max(1, Math.round((lateTimestamp - graceDeadline.getTime()) / (60 * 1000)));

    return {
      residentId,
      status: 'NOT_VERIFIED',
      statusReason: `Late return: Resident checked in ${lateMinutes} minute(s) past the curfew grace deadline`,
      curfewDate: date,
      curfewDeadline,
      graceDeadline,
      evaluatedAt: evaluationTime,
      isLateReturn: true,
      lateMinutes,
      resolvedEventId: firstLateEntry.id,
      resolvedLeaveId: null,
    };
  }

  // If not inside and no entry, check if they failed verification
  if (latestFailedAttempt) {
    return {
      residentId,
      status: 'VERIFICATION_FAILED',
      statusReason: `Presence verification attempt failed: ${latestFailedAttempt.failureReason || 'Verification rejected'}`,
      curfewDate: date,
      curfewDeadline,
      graceDeadline,
      evaluatedAt: evaluationTime,
      isLateReturn: false,
      resolvedEventId: null,
      resolvedLeaveId: null,
    };
  }

  // If evaluation happens after grace deadline has elapsed and no presence recorded:
  if (evaluationTime.getTime() > graceDeadline.getTime()) {
    return {
      residentId,
      status: 'NOT_VERIFIED',
      statusReason: 'Curfew grace deadline elapsed with no verified presence, active entry, or approved leave',
      curfewDate: date,
      curfewDeadline,
      graceDeadline,
      evaluatedAt: evaluationTime,
      isLateReturn: false,
      resolvedEventId: null,
      resolvedLeaveId: null,
    };
  }

  // Otherwise, curfew deadline + grace has not passed yet:
  return {
    residentId,
    status: 'PENDING_VERIFICATION',
    statusReason: 'Curfew window is active; awaiting resident check-in before grace deadline',
    curfewDate: date,
    curfewDeadline,
    graceDeadline,
    evaluatedAt: evaluationTime,
    isLateReturn: false,
    resolvedEventId: null,
    resolvedLeaveId: null,
  };
}
