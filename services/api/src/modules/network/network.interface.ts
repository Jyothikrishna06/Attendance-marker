/**
 * Network Evidence Provider Abstraction Layer
 * Defines institutional network verification contracts for curfew presence events.
 */

export interface NetworkVerificationContext {
  /**
   * The client IPv4 or normalized IP originating the request.
   * Derived server-side from socket or trusted reverse-proxy headers.
   */
  clientIp: string;

  /**
   * The UUID of the hostel where the resident is registered.
   */
  hostelId?: string;

  /**
   * The UUID of the resident attempting verification.
   */
  residentId?: string;

  /**
   * Express request headers, used by gateway providers to evaluate
   * cryptographic signatures, tokens, or reverse-proxy authentication headers.
   */
  headers?: Record<string, string | string[] | undefined>;

  /**
   * Observational metadata provided in the request body (e.g., client-reported Wi-Fi SSID/BSSID).
   * Note: Client-reported values are treated as untrusted hints and must never replace server evidence.
   */
  clientMetadata?: Record<string, unknown>;
}

export interface NetworkVerificationEvidence {
  clientIp: string;
  evaluatedSubnet?: string;
  gatewayIdentifier?: string;
  verifiedAt: string;
  providerType: 'SUBNET_CIDR' | 'GATEWAY_IP' | 'MOCK_DEV' | 'API_CONTROLLER';
  providerName: string;
  details?: Record<string, unknown>;
}

export interface NetworkVerificationResult {
  /**
   * Whether the client's network presence was verifiably validated.
   */
  verified: boolean;

  /**
   * The type of network verification provider employed.
   */
  providerType: 'SUBNET_CIDR' | 'GATEWAY_IP' | 'MOCK_DEV' | 'API_CONTROLLER';

  /**
   * Human-readable identifier for the provider instance.
   */
  providerName: string;

  /**
   * Structured, immutable evidence to attach to the presence event.
   */
  evidence: NetworkVerificationEvidence;

  /**
   * Machine-readable error code if verification failed.
   */
  failureReason?:
    | 'IP_NOT_IN_AUTHORIZED_SUBNET'
    | 'MISSING_OR_INVALID_GATEWAY_TOKEN'
    | 'GATEWAY_UNREACHABLE'
    | 'HOSTEL_NETWORK_POLICY_NOT_FOUND'
    | 'NETWORK_PROVIDER_FAILURE'
    | 'SIMULATED_NETWORK_REJECTION';
}

/**
 * Interface that all institutional network verification providers must implement.
 */
export interface INetworkEvidenceProvider {
  readonly providerType: 'SUBNET_CIDR' | 'GATEWAY_IP' | 'MOCK_DEV' | 'API_CONTROLLER';
  readonly providerName: string;

  /**
   * Evaluates network evidence from the client's connection context.
   * Must fail safely (return verified: false) on any network errors, timeouts, or policy mismatches.
   */
  verifyNetworkEvidence(context: NetworkVerificationContext): Promise<NetworkVerificationResult>;
}
