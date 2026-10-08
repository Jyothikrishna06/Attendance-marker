import {
  INetworkEvidenceProvider,
  NetworkVerificationContext,
  NetworkVerificationResult,
} from './network.interface.js';
import { isIpInCidr, normalizeIp } from './subnet.utils.js';
import { env } from '../../config/env.js';

export interface MockNetworkProviderOptions {
  providerName?: string;
  defaultAllowedCidrs?: string[];
  hostelSubnetMap?: Record<string, string[]>;
  simulateOutage?: boolean;
  forceReject?: boolean;
}

/**
 * Mock Network Evidence Provider for development, continuous integration, and local testing.
 * Supports configurable CIDR subnet ranges per hostel and fault simulation flags.
 */
export class MockNetworkProvider implements INetworkEvidenceProvider {
  public readonly providerType = 'MOCK_DEV' as const;
  public readonly providerName: string;

  private allowedCidrs: Set<string>;
  private hostelSubnets: Map<string, string[]>;
  private simulateOutage: boolean;
  private forceReject: boolean;

  constructor(options: MockNetworkProviderOptions = {}) {
    this.providerName = options.providerName ?? 'MockCampusNetworkProvider';

    // Parse configured CIDR blocks from env or fallback to campus Wi-Fi + local subnets
    const defaultSubnets = env.AUTHORIZED_WIFI_CIDRS
      ? env.AUTHORIZED_WIFI_CIDRS.split(',').map((c) => c.trim()).filter(Boolean)
      : ['172.29.247.0/24', '10.42.0.0/16', '127.0.0.1/32'];

    this.allowedCidrs = new Set(
      options.defaultAllowedCidrs ?? defaultSubnets
    );
    this.hostelSubnets = new Map(
      options.hostelSubnetMap ? Object.entries(options.hostelSubnetMap) : []
    );
    this.simulateOutage = options.simulateOutage ?? false;
    this.forceReject = options.forceReject ?? false;

    // Seed default Aryabhata Hall subnet if not present
    if (!this.hostelSubnets.has('a0000000-0000-0000-0000-000000000001')) {
      this.hostelSubnets.set('a0000000-0000-0000-0000-000000000001', Array.from(this.allowedCidrs));
    }
  }

  public setSimulateOutage(active: boolean): void {
    this.simulateOutage = active;
  }

  public setForceReject(active: boolean): void {
    this.forceReject = active;
  }

  public addAllowedCidr(cidr: string): void {
    this.allowedCidrs.add(cidr);
  }

  public setHostelSubnets(hostelId: string, cidrs: string[]): void {
    this.hostelSubnets.set(hostelId, cidrs);
  }

  public getHostelSubnets(hostelId: string): string[] | undefined {
    return this.hostelSubnets.get(hostelId);
  }

  async verifyNetworkEvidence(
    context: NetworkVerificationContext
  ): Promise<NetworkVerificationResult> {
    const verifiedAt = new Date().toISOString();
    const normalizedClientIp = normalizeIp(context.clientIp);

    // 1. Fault Simulation: Provider Outage
    if (this.simulateOutage) {
      return {
        verified: false,
        providerType: this.providerType,
        providerName: this.providerName,
        failureReason: 'GATEWAY_UNREACHABLE',
        evidence: {
          clientIp: normalizedClientIp,
          verifiedAt,
          providerType: this.providerType,
          providerName: this.providerName,
          details: { error: 'Simulated campus network controller connection timeout' },
        },
      };
    }

    // 2. Fault Simulation: Force Reject
    if (this.forceReject) {
      return {
        verified: false,
        providerType: this.providerType,
        providerName: this.providerName,
        failureReason: 'SIMULATED_NETWORK_REJECTION',
        evidence: {
          clientIp: normalizedClientIp,
          verifiedAt,
          providerType: this.providerType,
          providerName: this.providerName,
          details: { error: 'Simulated administrator policy rejection' },
        },
      };
    }

    // 3. Determine Candidate CIDRs
    // If context has hostelId, prefer hostel-specific subnets, falling back to global allowed CIDRs
    let candidateCidrs: string[] = [];
    if (context.hostelId && this.hostelSubnets.has(context.hostelId)) {
      candidateCidrs = this.hostelSubnets.get(context.hostelId)!;
    } else {
      candidateCidrs = Array.from(this.allowedCidrs);
    }

    // Check if client IP is within any authorized CIDR
    for (const cidr of candidateCidrs) {
      if (isIpInCidr(normalizedClientIp, cidr)) {
        return {
          verified: true,
          providerType: this.providerType,
          providerName: this.providerName,
          evidence: {
            clientIp: normalizedClientIp,
            evaluatedSubnet: cidr,
            verifiedAt,
            providerType: this.providerType,
            providerName: this.providerName,
            details: {
              hostelId: context.hostelId,
              matchedRule: 'CIDR_MATCH',
            },
          },
        };
      }
    }

    // 4. IP outside authorized subnets -> Safe rejection
    return {
      verified: false,
      providerType: this.providerType,
      providerName: this.providerName,
      failureReason: 'IP_NOT_IN_AUTHORIZED_SUBNET',
      evidence: {
        clientIp: normalizedClientIp,
        evaluatedSubnet: candidateCidrs.join(', '),
        verifiedAt,
        providerType: this.providerType,
        providerName: this.providerName,
        details: {
          hostelId: context.hostelId,
          candidateSubnets: candidateCidrs,
        },
      },
    };
  }
}
