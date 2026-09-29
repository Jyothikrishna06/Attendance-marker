import {
  INetworkEvidenceProvider,
  NetworkVerificationContext,
  NetworkVerificationResult,
} from './network.interface.js';
import { isIpInCidr, normalizeIp } from './subnet.utils.js';

export interface GatewayNetworkProviderOptions {
  providerName?: string;
  headerTokenName?: string;
  headerGatewayIdName?: string;
  /**
   * Map of gateway ID -> expected secret token / shared key.
   */
  trustedGateways?: Record<string, string>;
  /**
   * Map of hostel ID -> allowed CIDRs when routed through the gateway.
   */
  hostelSubnetMap?: Record<string, string[]>;
  /**
   * If true, requires both gateway token AND authorized subnet match.
   * If false, valid gateway token is sufficient proof of hostel network presence.
   */
  enforceSubnetCheck?: boolean;
}

/**
 * Production Gateway Network Evidence Provider.
 * Verifies presence requests originating through campus edge gateways, reverse proxies,
 * or Wi-Fi controller backends injecting authenticated gateway headers.
 */
export class GatewayNetworkProvider implements INetworkEvidenceProvider {
  public readonly providerType = 'GATEWAY_IP' as const;
  public readonly providerName: string;

  private headerTokenName: string;
  private headerGatewayIdName: string;
  private trustedGateways: Map<string, string>;
  private hostelSubnets: Map<string, string[]>;
  private enforceSubnetCheck: boolean;

  constructor(options: GatewayNetworkProviderOptions = {}) {
    this.providerName = options.providerName ?? 'CampusPerimeterGatewayProvider';
    this.headerTokenName = (options.headerTokenName ?? 'x-hostel-gateway-token').toLowerCase();
    this.headerGatewayIdName = (options.headerGatewayIdName ?? 'x-hostel-gateway-id').toLowerCase();
    this.trustedGateways = new Map(
      options.trustedGateways ? Object.entries(options.trustedGateways) : []
    );
    this.hostelSubnets = new Map(
      options.hostelSubnetMap ? Object.entries(options.hostelSubnetMap) : []
    );
    this.enforceSubnetCheck = options.enforceSubnetCheck ?? true;

    // Seed production default gateway for Aryabhata Hall if none provided
    if (this.trustedGateways.size === 0) {
      this.trustedGateways.set('GATEWAY-HOSTEL-A-01', 'campus_prod_sec_key_aryabhata_2026');
    }
    if (!this.hostelSubnets.has('a0000000-0000-0000-0000-000000000001')) {
      this.hostelSubnets.set('a0000000-0000-0000-0000-000000000001', ['10.42.0.0/16']);
    }
  }

  public registerGateway(gatewayId: string, secretToken: string): void {
    this.trustedGateways.set(gatewayId, secretToken);
  }

  public setHostelSubnets(hostelId: string, cidrs: string[]): void {
    this.hostelSubnets.set(hostelId, cidrs);
  }

  async verifyNetworkEvidence(
    context: NetworkVerificationContext
  ): Promise<NetworkVerificationResult> {
    const verifiedAt = new Date().toISOString();
    const normalizedClientIp = normalizeIp(context.clientIp);

    try {
      const headers = context.headers || {};
      const rawGatewayToken = headers[this.headerTokenName];
      const rawGatewayId = headers[this.headerGatewayIdName];

      const gatewayToken = Array.isArray(rawGatewayToken) ? rawGatewayToken[0] : rawGatewayToken;
      const gatewayId = Array.isArray(rawGatewayId) ? rawGatewayId[0] : rawGatewayId;

      // 1. Verify Gateway Token & Identifier
      if (!gatewayId || !gatewayToken) {
        return {
          verified: false,
          providerType: this.providerType,
          providerName: this.providerName,
          failureReason: 'MISSING_OR_INVALID_GATEWAY_TOKEN',
          evidence: {
            clientIp: normalizedClientIp,
            gatewayIdentifier: gatewayId,
            verifiedAt,
            providerType: this.providerType,
            providerName: this.providerName,
            details: { reason: 'Gateway header token or gateway ID was not provided in request' },
          },
        };
      }

      const expectedToken = this.trustedGateways.get(gatewayId);
      if (!expectedToken || expectedToken !== gatewayToken) {
        return {
          verified: false,
          providerType: this.providerType,
          providerName: this.providerName,
          failureReason: 'MISSING_OR_INVALID_GATEWAY_TOKEN',
          evidence: {
            clientIp: normalizedClientIp,
            gatewayIdentifier: gatewayId,
            verifiedAt,
            providerType: this.providerType,
            providerName: this.providerName,
            details: { reason: 'Untrusted gateway ID or invalid authentication token handshake' },
          },
        };
      }

      // 2. Subnet CIDR Verification (if enforced)
      if (this.enforceSubnetCheck && context.hostelId) {
        const allowedCidrs = this.hostelSubnets.get(context.hostelId);
        if (allowedCidrs && allowedCidrs.length > 0) {
          const inSubnet = allowedCidrs.some((cidr) => isIpInCidr(normalizedClientIp, cidr));
          if (!inSubnet) {
            return {
              verified: false,
              providerType: this.providerType,
              providerName: this.providerName,
              failureReason: 'IP_NOT_IN_AUTHORIZED_SUBNET',
              evidence: {
                clientIp: normalizedClientIp,
                gatewayIdentifier: gatewayId,
                evaluatedSubnet: allowedCidrs.join(', '),
                verifiedAt,
                providerType: this.providerType,
                providerName: this.providerName,
                details: {
                  hostelId: context.hostelId,
                  reason: 'Client IP does not match the designated subnet for this hostel',
                },
              },
            };
          }
        }
      }

      // 3. Multi-layer verification succeeded
      return {
        verified: true,
        providerType: this.providerType,
        providerName: this.providerName,
        evidence: {
          clientIp: normalizedClientIp,
          gatewayIdentifier: gatewayId,
          evaluatedSubnet: context.hostelId ? this.hostelSubnets.get(context.hostelId)?.[0] : undefined,
          verifiedAt,
          providerType: this.providerType,
          providerName: this.providerName,
          details: {
            hostelId: context.hostelId,
            tokenVerified: true,
            enforceSubnetCheck: this.enforceSubnetCheck,
          },
        },
      };
    } catch (err) {
      // Fail-Safe: Always reject rather than allow unverified network access on error
      return {
        verified: false,
        providerType: this.providerType,
        providerName: this.providerName,
        failureReason: 'NETWORK_PROVIDER_FAILURE',
        evidence: {
          clientIp: normalizedClientIp,
          verifiedAt,
          providerType: this.providerType,
          providerName: this.providerName,
          details: {
            error: err instanceof Error ? err.message : 'Unknown gateway provider error',
          },
        },
      };
    }
  }
}
