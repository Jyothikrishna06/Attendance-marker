import crypto from 'crypto';
import {
  Hostel,
  Room,
  CurfewRule,
  LeaveRequest,
  AuditLog,
  AdminAction,
  LeaveStatus,
} from '../../common/types.js';
import { LeaveRequestFilter, AuditLogFilter } from './admin.interface.js';
import { IAuditRepository } from '../audit/audit.repository.js';

export interface IAdminRepository {
  getHostels(): Promise<Hostel[]>;
  findHostelById(id: string): Promise<Hostel | null>;
  findHostelByCode(code: string): Promise<Hostel | null>;

  getRooms(): Promise<Room[]>;
  findRoomById(id: string): Promise<Room | null>;
  findRoomsByHostelId(hostelId: string): Promise<Room[]>;

  getCurfewRules(hostelId?: string): Promise<CurfewRule[]>;
  findCurfewRuleById(id: string): Promise<CurfewRule | null>;
  findActiveCurfewRule(hostelId: string, dayOfWeek: number): Promise<CurfewRule | null>;
  createCurfewRule(rule: Omit<CurfewRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<CurfewRule>;
  updateCurfewRule(id: string, updates: Partial<CurfewRule>): Promise<CurfewRule>;

  getLeaveRequests(filter?: LeaveRequestFilter): Promise<LeaveRequest[]>;
  findLeaveRequestById(id: string): Promise<LeaveRequest | null>;
  findActiveLeaveForResident(residentId: string, timestamp?: Date): Promise<LeaveRequest | null>;
  createLeaveRequest(request: Omit<LeaveRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<LeaveRequest>;
  updateLeaveRequest(id: string, updates: Partial<LeaveRequest>): Promise<LeaveRequest>;

  createAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog>;
  getAuditLogs(filter?: AuditLogFilter): Promise<AuditLog[]>;

  createAdminAction(action: Omit<AdminAction, 'id' | 'createdAt'>): Promise<AdminAction>;
  getAdminActions(): Promise<AdminAction[]>;
}

export class InMemoryAdminRepository implements IAdminRepository {
  private hostels: Map<string, Hostel> = new Map();
  private rooms: Map<string, Room> = new Map();
  private curfewRules: Map<string, CurfewRule> = new Map();
  private leaveRequests: Map<string, LeaveRequest> = new Map();
  private auditLogs: AuditLog[] = [];
  private adminActions: AdminAction[] = [];

  constructor(private auditRepo?: IAuditRepository) {
    this.seedInitialData();
  }

  public seedInitialData(): void {
    // 1. Hostels
    this.hostels.set('a0000000-0000-0000-0000-000000000001', {
      id: 'a0000000-0000-0000-0000-000000000001',
      name: 'Aryabhata Hall of Residence',
      code: 'HOSTEL-A',
      address: 'North Campus, Engineering Block A',
      totalCapacity: 250,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.hostels.set('a0000000-0000-0000-0000-000000000002', {
      id: 'a0000000-0000-0000-0000-000000000002',
      name: 'Kalpana Chawla Hall of Residence',
      code: 'HOSTEL-K',
      address: 'South Campus, Science Block B',
      totalCapacity: 200,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Rooms
    this.rooms.set('b0000000-0000-0000-0000-000000000101', {
      id: 'b0000000-0000-0000-0000-000000000101',
      hostelId: 'a0000000-0000-0000-0000-000000000001',
      roomNumber: '101',
      floor: 1,
      capacity: 2,
      currentOccupancy: 2,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.rooms.set('b0000000-0000-0000-0000-000000000102', {
      id: 'b0000000-0000-0000-0000-000000000102',
      hostelId: 'a0000000-0000-0000-0000-000000000001',
      roomNumber: '102',
      floor: 1,
      capacity: 2,
      currentOccupancy: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.rooms.set('b0000000-0000-0000-0000-000000000201', {
      id: 'b0000000-0000-0000-0000-000000000201',
      hostelId: 'a0000000-0000-0000-0000-000000000001',
      roomNumber: '201',
      floor: 2,
      capacity: 3,
      currentOccupancy: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Curfew Rules
    this.curfewRules.set('70000000-0000-0000-0000-000000000001', {
      id: '70000000-0000-0000-0000-000000000001',
      hostelId: 'a0000000-0000-0000-0000-000000000001',
      dayOfWeek: null, // default daily
      curfewTime: '21:30:00',
      gracePeriodMinutes: 15,
      isActive: true,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.curfewRules.set('70000000-0000-0000-0000-000000000002', {
      id: '70000000-0000-0000-0000-000000000002',
      hostelId: 'a0000000-0000-0000-0000-000000000001',
      dayOfWeek: 6, // Saturday extended curfew
      curfewTime: '22:30:00',
      gracePeriodMinutes: 30,
      isActive: true,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4. Leave Requests
    const now = new Date();
    // Diya Sharma: Approved outpass
    this.leaveRequests.set('80000000-0000-0000-0000-000000000001', {
      id: '80000000-0000-0000-0000-000000000001',
      residentId: 'd0000000-0000-0000-0000-000000000002',
      leaveType: 'OUTPASS',
      startTime: new Date(now.getTime() - 24 * 3600 * 1000),
      endTime: new Date(now.getTime() + 24 * 3600 * 1000),
      reason: 'Attending National Robotics Conference Hackathon',
      status: 'APPROVED',
      approverId: 'c0000000-0000-0000-0000-000000000002',
      decisionReason: 'Verified conference pass and parent consent letter',
      decisionTimestamp: new Date(now.getTime() - 3 * 3600 * 1000),
      createdAt: new Date(now.getTime() - 4 * 3600 * 1000),
      updatedAt: new Date(now.getTime() - 3 * 3600 * 1000),
    });

    // Aarav Patel: Pending outpass
    this.leaveRequests.set('80000000-0000-0000-0000-000000000002', {
      id: '80000000-0000-0000-0000-000000000002',
      residentId: 'd0000000-0000-0000-0000-000000000001',
      leaveType: 'NIGHT_OUT',
      startTime: new Date(now.getTime() + 24 * 3600 * 1000),
      endTime: new Date(now.getTime() + 48 * 3600 * 1000),
      reason: 'Attending sister wedding ceremony with family in Pune',
      status: 'PENDING',
      approverId: null,
      decisionReason: null,
      decisionTimestamp: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5. Audit Logs
    this.auditLogs.push({
      id: '90000000-0000-0000-0000-000000000001',
      actorId: 'c0000000-0000-0000-0000-000000000001',
      actorRole: 'SUPER_ADMIN',
      action: 'DEVICE_REVOCATION',
      targetEntity: 'devices',
      targetId: 'e0000000-0000-0000-0000-000000000002',
      previousState: { status: 'ACTIVE' },
      newState: { status: 'REVOKED' },
      reason: 'Resident reported lost device; registered replacement Pixel 8',
      ipAddress: '127.0.0.1',
      timestamp: new Date(now.getTime() - 24 * 3600 * 1000),
    });

    // 6. Admin Actions
    this.adminActions.push({
      id: '90000000-0000-0000-0000-000000000002',
      adminId: 'c0000000-0000-0000-0000-000000000001',
      actionType: 'CURFEW_RULE_CHANGE',
      targetId: '70000000-0000-0000-0000-000000000001',
      details: { curfewTime: '21:30:00', gracePeriodMinutes: 15 },
      justification: 'Established baseline semester curfew policy per Warden Council resolution',
      createdAt: new Date(now.getTime() - 48 * 3600 * 1000),
    });
  }

  async getHostels(): Promise<Hostel[]> {
    return Array.from(this.hostels.values());
  }

  async findHostelById(id: string): Promise<Hostel | null> {
    return this.hostels.get(id) || null;
  }

  async findHostelByCode(code: string): Promise<Hostel | null> {
    for (const h of this.hostels.values()) {
      if (h.code.toUpperCase() === code.trim().toUpperCase()) {
        return h;
      }
    }
    return null;
  }

  async getRooms(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }

  async findRoomById(id: string): Promise<Room | null> {
    return this.rooms.get(id) || null;
  }

  async findRoomsByHostelId(hostelId: string): Promise<Room[]> {
    return Array.from(this.rooms.values()).filter((r) => r.hostelId === hostelId);
  }

  async getCurfewRules(hostelId?: string): Promise<CurfewRule[]> {
    const rules = Array.from(this.curfewRules.values());
    if (hostelId) {
      return rules.filter((r) => r.hostelId === hostelId);
    }
    return rules;
  }

  async findCurfewRuleById(id: string): Promise<CurfewRule | null> {
    return this.curfewRules.get(id) || null;
  }

  async findActiveCurfewRule(hostelId: string, dayOfWeek: number): Promise<CurfewRule | null> {
    const rules = Array.from(this.curfewRules.values()).filter(
      (r) => r.hostelId === hostelId && r.isActive
    );

    // 1. Look for specific day rule
    const dayRule = rules.find((r) => r.dayOfWeek === dayOfWeek);
    if (dayRule) return dayRule;

    // 2. Fallback to default daily rule (dayOfWeek === null)
    const defaultRule = rules.find((r) => r.dayOfWeek === null || r.dayOfWeek === undefined);
    return defaultRule || null;
  }

  async createCurfewRule(rule: Omit<CurfewRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<CurfewRule> {
    const newRule: CurfewRule = {
      id: crypto.randomUUID(),
      ...rule,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.curfewRules.set(newRule.id, newRule);
    return newRule;
  }

  async updateCurfewRule(id: string, updates: Partial<CurfewRule>): Promise<CurfewRule> {
    const rule = this.curfewRules.get(id);
    if (!rule) {
      throw new Error(`Curfew rule ${id} not found`);
    }
    const updated: CurfewRule = {
      ...rule,
      ...updates,
      updatedAt: new Date(),
    };
    this.curfewRules.set(id, updated);
    return updated;
  }

  async getLeaveRequests(filter?: LeaveRequestFilter): Promise<LeaveRequest[]> {
    let leaves = Array.from(this.leaveRequests.values());
    if (filter?.status) {
      leaves = leaves.filter((l) => l.status === filter.status);
    }
    if (filter?.residentId) {
      leaves = leaves.filter((l) => l.residentId === filter.residentId);
    }
    return leaves.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findLeaveRequestById(id: string): Promise<LeaveRequest | null> {
    return this.leaveRequests.get(id) || null;
  }

  async findActiveLeaveForResident(residentId: string, timestamp = new Date()): Promise<LeaveRequest | null> {
    const leaves = Array.from(this.leaveRequests.values()).filter(
      (l) =>
        l.residentId === residentId &&
        l.status === 'APPROVED' &&
        l.startTime.getTime() <= timestamp.getTime() &&
        l.endTime.getTime() >= timestamp.getTime()
    );
    return leaves.length > 0 ? leaves[0] : null;
  }

  async createLeaveRequest(request: Omit<LeaveRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<LeaveRequest> {
    const newRequest: LeaveRequest = {
      id: crypto.randomUUID(),
      ...request,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.leaveRequests.set(newRequest.id, newRequest);
    return newRequest;
  }

  async updateLeaveRequest(id: string, updates: Partial<LeaveRequest>): Promise<LeaveRequest> {
    const leave = this.leaveRequests.get(id);
    if (!leave) {
      throw new Error(`Leave request ${id} not found`);
    }
    const updated: LeaveRequest = {
      ...leave,
      ...updates,
      updatedAt: new Date(),
    };
    this.leaveRequests.set(id, updated);
    return updated;
  }

  async createAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    if (this.auditRepo) {
      return this.auditRepo.createAuditLog(log);
    }
    const newLog: AuditLog = {
      id: crypto.randomUUID(),
      ...log,
      timestamp: new Date(),
    };
    this.auditLogs.unshift(newLog); // newest first
    return newLog;
  }

  async getAuditLogs(filter?: AuditLogFilter): Promise<AuditLog[]> {
    if (this.auditRepo) {
      return this.auditRepo.getAuditLogs(filter);
    }
    let logs = [...this.auditLogs];
    if (filter?.targetEntity) {
      logs = logs.filter((l) => l.targetEntity.toLowerCase() === filter.targetEntity!.toLowerCase());
    }
    if (filter?.action) {
      logs = logs.filter((l) => l.action.toLowerCase() === filter.action!.toLowerCase());
    }
    if (filter?.actorId) {
      logs = logs.filter((l) => l.actorId === filter.actorId);
    }
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 50;
    return logs.slice(offset, offset + limit);
  }

  async createAdminAction(action: Omit<AdminAction, 'id' | 'createdAt'>): Promise<AdminAction> {
    const newAction: AdminAction = {
      id: crypto.randomUUID(),
      ...action,
      createdAt: new Date(),
    };
    this.adminActions.unshift(newAction);
    return newAction;
  }

  async getAdminActions(): Promise<AdminAction[]> {
    return [...this.adminActions];
  }
}
