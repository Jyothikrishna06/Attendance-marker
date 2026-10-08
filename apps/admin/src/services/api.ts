import {
  CurrentCurfewPolicy,
  CurfewSummary,
  ResidentStatusItem,
  LeaveRequest,
  AuditLogItem,
  FilterState,
  ResidentStatus,
} from '../types/index.js';

const API_BASE =
  (import.meta as any).env?.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost'
    ? `http://${window.location.hostname}:4000`
    : 'http://localhost:4000');

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('warden_token', token);
    } else {
      localStorage.removeItem('warden_token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('warden_token');
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data?.error?.message || data?.message || `Request failed with status ${res.status}`;
      const err = new Error(errorMsg) as Error & { code?: string; details?: unknown; status: number };
      err.code = data?.error?.code;
      err.details = data?.error?.details;
      err.status = res.status;
      throw err;
    }

    return data;
  }

  // Authentication
  async login(email: string, password: string, wardenSecretCode?: string) {
    const res = await this.request<{
      data: {
        accessToken: string;
        refreshToken: string;
        user: { id: string; name: string; email: string; role: any };
      };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, wardenSecretCode: wardenSecretCode?.trim() || undefined }),
    });

    this.setToken(res.data.accessToken);
    return res.data;
  }

  // 1. Current Curfew
  async getCurrentCurfew(hostelId?: string): Promise<CurrentCurfewPolicy> {
    const q = hostelId ? `?hostelId=${encodeURIComponent(hostelId)}` : '';
    const res = await this.request<{ data: CurrentCurfewPolicy }>(`/curfew/current${q}`);
    return res.data;
  }

  // 2. Update Curfew Rule
  async updateCurfewRule(
    ruleId: string,
    updates: { curfewTime?: string; gracePeriodMinutes?: number; justification?: string }
  ) {
    const res = await this.request<{ data: any }>(`/admin/curfew/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return res.data;
  }

  // 3. Status Roster & Summary
  async getCurfewStatus(filters?: Partial<FilterState>): Promise<{
    summary: CurfewSummary;
    roster: ResidentStatusItem[];
    timestamp: string;
  }> {
    const params = new URLSearchParams();
    if (filters?.hostelId && filters.hostelId !== 'ALL') {
      params.append('hostelId', filters.hostelId);
    }
    if (filters?.floor && filters.floor !== 'ALL') {
      params.append('floor', filters.floor);
    }
    if (filters?.roomSearch) {
      params.append('roomNumber', filters.roomSearch);
    }
    if (filters?.status && filters.status !== 'ALL') {
      params.append('status', filters.status);
    }

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ data: { summary: CurfewSummary; roster: ResidentStatusItem[]; timestamp: string } }>(
      `/admin/curfew/status${query}`
    );
    return res.data;
  }

  // 4. Leave Requests
  async getLeaveRequests(status?: string): Promise<LeaveRequest[]> {
    const q = status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : '';
    const res = await this.request<{ data: LeaveRequest[] }>(`/admin/leave${q}`);
    return res.data;
  }

  // 5. Adjudicate Leave
  async adjudicateLeave(id: string, status: 'APPROVED' | 'REJECTED', decisionReason: string) {
    const res = await this.request<{ data: LeaveRequest }>(`/admin/leave/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, decisionReason }),
    });
    return res.data;
  }

  // 6. Record Correction
  async correctPresenceRecord(input: {
    residentId: string;
    status: ResidentStatus;
    reason: string;
    eventId?: string;
  }) {
    const res = await this.request<{ data: any }>('/admin/presence/correct', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data;
  }

  // 7. Audit History
  async getAuditLogs(entity?: string): Promise<AuditLogItem[]> {
    const q = entity && entity !== 'ALL' ? `?targetEntity=${encodeURIComponent(entity)}` : '';
    const res = await this.request<{ data: AuditLogItem[] }>(`/admin/audit${q}`);
    return res.data;
  }

  // 8. Resident Presence Operations
  async getMyPresenceStatus() {
    const res = await this.request<{ data: any }>('/presence/me');
    return res.data;
  }

  async generateChallenge() {
    const res = await this.request<{
      data: { challengeId: string; challengeNonce: string; expiresAt: string; ttlSeconds: number };
    }>('/verification/challenge/generate', {
      method: 'POST',
      body: JSON.stringify({ clientMetadata: { platform: 'WEB_PORTAL' } }),
    });
    return res.data;
  }

  async verifyPresence(challengeId: string, challengeNonce: string, biometricConfirmed = true) {
    const res = await this.request<{ data: any }>('/presence/entry/verify', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: challengeId,
        challengeId,
        challengeNonce,
        biometricConfirmed,
      }),
    });
    return res.data;
  }

  async exitPresence() {
    const res = await this.request<{ data: any }>('/presence/exit', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Student marked exit via web portal' }),
    });
    return res.data;
  }
}

export const api = new ApiService();
