import crypto from 'crypto';
import { CurfewEvaluationRecord, ResidentEvaluationResult } from './curfew-evaluation.types.js';

export interface ICurfewEvaluationRepository {
  saveEvaluationResults(
    hostelId: string,
    results: ResidentEvaluationResult[]
  ): Promise<CurfewEvaluationRecord[]>;

  findEvaluationsByHostelAndDate(
    hostelId: string,
    curfewDate: string
  ): Promise<CurfewEvaluationRecord[]>;

  findEvaluationByResidentAndDate(
    residentId: string,
    curfewDate: string
  ): Promise<CurfewEvaluationRecord | null>;

  getAllEvaluations(): Promise<CurfewEvaluationRecord[]>;
}

export class InMemoryCurfewEvaluationRepository implements ICurfewEvaluationRepository {
  // Key: `${hostelId}:${curfewDate}:${residentId}`
  private records: Map<string, CurfewEvaluationRecord> = new Map();

  async saveEvaluationResults(
    hostelId: string,
    results: ResidentEvaluationResult[]
  ): Promise<CurfewEvaluationRecord[]> {
    const savedRecords: CurfewEvaluationRecord[] = [];
    const now = new Date();

    for (const result of results) {
      const key = `${hostelId}:${result.curfewDate}:${result.residentId}`;
      const existing = this.records.get(key);

      const record: CurfewEvaluationRecord = {
        id: existing?.id || crypto.randomUUID(),
        residentId: result.residentId,
        hostelId,
        curfewDate: result.curfewDate,
        status: result.status,
        statusReason: result.statusReason,
        curfewDeadline: result.curfewDeadline,
        graceDeadline: result.graceDeadline,
        isLateReturn: result.isLateReturn,
        lateMinutes: result.lateMinutes || null,
        resolvedEventId: result.resolvedEventId || null,
        resolvedLeaveId: result.resolvedLeaveId || null,
        evaluatedAt: result.evaluatedAt,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      this.records.set(key, record);
      savedRecords.push(record);
    }

    return savedRecords;
  }

  async findEvaluationsByHostelAndDate(
    hostelId: string,
    curfewDate: string
  ): Promise<CurfewEvaluationRecord[]> {
    const results: CurfewEvaluationRecord[] = [];
    for (const record of this.records.values()) {
      if (record.hostelId === hostelId && record.curfewDate === curfewDate) {
        results.push(record);
      }
    }
    return results;
  }

  async findEvaluationByResidentAndDate(
    residentId: string,
    curfewDate: string
  ): Promise<CurfewEvaluationRecord | null> {
    for (const record of this.records.values()) {
      if (record.residentId === residentId && record.curfewDate === curfewDate) {
        return record;
      }
    }
    return null;
  }

  async getAllEvaluations(): Promise<CurfewEvaluationRecord[]> {
    return Array.from(this.records.values());
  }
}
