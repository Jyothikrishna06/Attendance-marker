import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryAuthRepository } from '../src/modules/auth/auth.repository.js';
import { InMemoryPresenceRepository } from '../src/modules/presence/presence.repository.js';
import { hashPassword } from '../src/core/crypto.js';
import {
  isIpInCidr,
  normalizeIp,
  ipToLong,
  MockNetworkProvider,
  GatewayNetworkProvider,
} from '../src/modules/network/index.js';

describe('Network-Verification Abstraction Layer Test Suite', () => {
  describe('Subnet & CIDR Utility Functions (subnet.utils)', () => {
    it('normalizeIp: should handle IPv4, IPv6 loopback, and IPv6-mapped IPv4 addresses', () => {
      assert.equal(normalizeIp('10.42.1.1'), '10.42.1.1');
      assert.equal(normalizeIp('::1'), '127.0.0.1');
      assert.equal(normalizeIp('localhost'), '127.0.0.1');
      assert.equal(normalizeIp('::ffff:10.42.0.1'), '10.42.0.1');
      assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
      assert.equal(normalizeIp('192.168.1.100:8080'), '192.168.1.100');
      assert.equal(normalizeIp(''), '127.0.0.1');
    });

    it('ipToLong: should convert dotted-quad IPv4 strings to 32-bit unsigned integers', () => {
      assert.equal(ipToLong('0.0.0.0'), 0);
      assert.equal(ipToLong('127.0.0.1'), 2130706433);
      assert.equal(ipToLong('10.42.0.1'), 170524673);
      assert.equal(ipToLong('255.255.255.255'), 4294967295);

      // Invalid IPs should return null
      assert.equal(ipToLong('256.0.0.1'), null);
      assert.equal(ipToLong('10.42.1'), null);
      assert.equal(ipToLong('invalid.ip.string'), null);
      assert.equal(ipToLong('10.42.0.1.5'), null);
    });

    it('isIpInCidr: should accurately evaluate IPv4 addresses against CIDR prefixes', () => {
      // /16 Subnet (Aryabhata Hall: 10.42.0.0/16)
      assert.equal(isIpInCidr('10.42.0.1', '10.42.0.0/16'), true);
      assert.equal(isIpInCidr('10.42.254.254', '10.42.0.0/16'), true);
      assert.equal(isIpInCidr('10.43.0.1', '10.42.0.0/16'), false);
      assert.equal(isIpInCidr('192.168.1.1', '10.42.0.0/16'), false);

      // /24 Subnet
      assert.equal(isIpInCidr('192.168.5.10', '192.168.5.0/24'), true);
      assert.equal(isIpInCidr('192.168.6.10', '192.168.5.0/24'), false);

      // /32 Single Host
      assert.equal(isIpInCidr('127.0.0.1', '127.0.0.1/32'), true);
      assert.equal(isIpInCidr('127.0.0.2', '127.0.0.1/32'), false);

      // /0 Entire IPv4 Space
      assert.equal(isIpInCidr('8.8.8.8', '0.0.0.0/0'), true);

      // Gracefully handle malformed inputs
      assert.equal(isIpInCidr('invalid-ip', '10.42.0.0/16'), false);
      assert.equal(isIpInCidr('10.42.0.1', 'invalid-cidr'), false);
      assert.equal(isIpInCidr('', '10.42.0.0/16'), false);
    });
  });

  describe('MockNetworkProvider Unit Tests', () => {
    it('should verify client IP matching authorized hostel CIDR', async () => {
      const provider = new MockNetworkProvider({
        hostelSubnetMap: {
          'hostel-test-1': ['10.42.0.0/16'],
        },
      });

      const result = await provider.verifyNetworkEvidence({
        clientIp: '10.42.5.25',
        hostelId: 'hostel-test-1',
      });

      assert.equal(result.verified, true);
      assert.equal(result.providerType, 'MOCK_DEV');
      assert.equal(result.evidence.clientIp, '10.42.5.25');
      assert.equal(result.evidence.evaluatedSubnet, '10.42.0.0/16');
    });

    it('should safely reject client IP outside authorized hostel CIDR', async () => {
      const provider = new MockNetworkProvider({
        hostelSubnetMap: {
          'hostel-test-1': ['10.42.0.0/16'],
        },
      });

      const result = await provider.verifyNetworkEvidence({
        clientIp: '198.51.100.12',
        hostelId: 'hostel-test-1',
      });

      assert.equal(result.verified, false);
      assert.equal(result.failureReason, 'IP_NOT_IN_AUTHORIZED_SUBNET');
      assert.equal(result.evidence.clientIp, '198.51.100.12');
    });

    it('should reject verification when outage is simulated (Fail-Safe)', async () => {
      const provider = new MockNetworkProvider({
        simulateOutage: true,
      });

      const result = await provider.verifyNetworkEvidence({
        clientIp: '10.42.1.1',
      });

      assert.equal(result.verified, false);
      assert.equal(result.failureReason, 'GATEWAY_UNREACHABLE');
    });

    it('should reject verification when policy forceReject is active', async () => {
      const provider = new MockNetworkProvider();
      provider.setForceReject(true);

      const result = await provider.verifyNetworkEvidence({
        clientIp: '10.42.1.1',
      });

      assert.equal(result.verified, false);
      assert.equal(result.failureReason, 'SIMULATED_NETWORK_REJECTION');
    });
  });

  describe('GatewayNetworkProvider Unit Tests', () => {
    const validGatewayId = 'GATEWAY-HOSTEL-A-01';
    const validToken = 'secret_campus_gateway_token_2026';

    it('should verify request when gateway token and subnet both match', async () => {
      const provider = new GatewayNetworkProvider({
        trustedGateways: {
          [validGatewayId]: validToken,
        },
        hostelSubnetMap: {
          'hostel-a': ['10.42.0.0/16'],
        },
        enforceSubnetCheck: true,
      });

      const result = await provider.verifyNetworkEvidence({
        clientIp: '10.42.10.88',
        hostelId: 'hostel-a',
        headers: {
          'x-hostel-gateway-id': validGatewayId,
          'x-hostel-gateway-token': validToken,
        },
      });

      assert.equal(result.verified, true);
      assert.equal(result.providerType, 'GATEWAY_IP');
      assert.equal(result.evidence.gatewayIdentifier, validGatewayId);
      assert.equal(result.evidence.clientIp, '10.42.10.88');
    });

    it('should reject when gateway token is missing', async () => {
      const provider = new GatewayNetworkProvider();

      const result = await provider.verifyNetworkEvidence({
        clientIp: '10.42.10.88',
        headers: {},
      });

      assert.equal(result.verified, false);
      assert.equal(result.failureReason, 'MISSING_OR_INVALID_GATEWAY_TOKEN');
    });

    it('should reject when gateway token is forged or invalid', async () => {
      const provider = new GatewayNetworkProvider({
        trustedGateways: {
          [validGatewayId]: validToken,
        },
      });

      const result = await provider.verifyNetworkEvidence({
        clientIp: '10.42.10.88',
        headers: {
          'x-hostel-gateway-id': validGatewayId,
          'x-hostel-gateway-token': 'forged_fake_token_attempt',
        },
      });

      assert.equal(result.verified, false);
      assert.equal(result.failureReason, 'MISSING_OR_INVALID_GATEWAY_TOKEN');
    });

    it('should reject when gateway token is valid but client IP is not in hostel subnet', async () => {
      const provider = new GatewayNetworkProvider({
        trustedGateways: {
          [validGatewayId]: validToken,
        },
        hostelSubnetMap: {
          'hostel-a': ['10.42.0.0/16'],
        },
        enforceSubnetCheck: true,
      });

      const result = await provider.verifyNetworkEvidence({
        clientIp: '203.0.113.5', // External cellular IP spoofing proxy
        hostelId: 'hostel-a',
        headers: {
          'x-hostel-gateway-id': validGatewayId,
          'x-hostel-gateway-token': validToken,
        },
      });

      assert.equal(result.verified, false);
      assert.equal(result.failureReason, 'IP_NOT_IN_AUTHORIZED_SUBNET');
    });
  });

  describe('Integration: Presence Entry Flow with Network Verification', () => {
    let authRepo: InMemoryAuthRepository;
    let presenceRepo: InMemoryPresenceRepository;
    let mockNetworkProvider: MockNetworkProvider;
    let app: ReturnType<typeof createApp>;
    let residentAccessToken: string;

    const testResidentCredentials = {
      email: 'aarav.patel@student.edu',
      password: 'ResidentPass!2026',
    };

    before(async () => {
      authRepo = new InMemoryAuthRepository();
      presenceRepo = new InMemoryPresenceRepository();
      mockNetworkProvider = new MockNetworkProvider();

      const residentPass = await hashPassword('ResidentPass!2026');
      await authRepo.updateUserPasswordAndStatus(
        'c0000000-0000-0000-0000-000000000003',
        residentPass,
        'ACTIVE'
      );

      app = createApp(authRepo, presenceRepo, mockNetworkProvider);

      const res = await request(app)
        .post('/auth/login')
        .send(testResidentCredentials);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.accessToken);
      residentAccessToken = res.body.data.accessToken;
    });

    it('POSITIVE TEST: should accept entry verification when client IP is in authorized hostel subnet', async () => {
      // 1. Start Entry Session
      const startRes = await request(app)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${residentAccessToken}`)
        .send({});

      assert.equal(startRes.status, 200);
      const { sessionId, challengeNonce } = startRes.body.data;

      // 2. Verify Entry with authorized hostel Wi-Fi IP (10.42.1.25)
      const verifyRes = await request(app)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${residentAccessToken}`)
        .set('x-forwarded-for', '10.42.1.25')
        .send({
          sessionId,
          challengeNonce,
          biometricConfirmed: true,
          networkMetadata: { clientSsid: 'HostelAryabhata_WiFi' },
        });

      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.body.data.status, 'VERIFIED_INSIDE');
      assert.equal(verifyRes.body.data.sessionId, sessionId);

      // 3. Confirm Presence State is VERIFIED_INSIDE
      const meRes = await request(app)
        .get('/presence/me')
        .set('Authorization', `Bearer ${residentAccessToken}`);

      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.data.currentStatus, 'VERIFIED_INSIDE');

      // 4. Exit to reset state for subsequent tests
      const exitRes = await request(app)
        .post('/presence/exit')
        .set('Authorization', `Bearer ${residentAccessToken}`)
        .send({ reason: 'Stepping out for dinner' });

      assert.equal(exitRes.status, 200);
      assert.equal(exitRes.body.data.status, 'VERIFIED_OUTSIDE');
    });

    it('NEGATIVE TEST: should safely reject entry verification with HTTP 403 NETWORK_NOT_AUTHORIZED when client IP is unauthorized', async () => {
      // 1. Start Entry Session
      const startRes = await request(app)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${residentAccessToken}`)
        .send({});

      assert.equal(startRes.status, 200);
      const { sessionId, challengeNonce } = startRes.body.data;

      // 2. Verify Entry with off-campus cellular IP (198.51.100.99)
      const verifyRes = await request(app)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${residentAccessToken}`)
        .set('x-forwarded-for', '198.51.100.99')
        .send({
          sessionId,
          challengeNonce,
          biometricConfirmed: true,
          networkMetadata: { spoofedSsid: 'HostelAryabhata_WiFi' }, // Spoofed client hint
        });

      // Must be safely rejected with 403 Forbidden
      assert.equal(verifyRes.status, 403);
      assert.equal(verifyRes.body.error.code, 'NETWORK_NOT_AUTHORIZED');
      assert.match(verifyRes.body.error.message, /not connected to an authorized hostel network/i);

      // 3. Confirm Presence State remained OUTSIDE
      const meRes = await request(app)
        .get('/presence/me')
        .set('Authorization', `Bearer ${residentAccessToken}`);

      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.data.currentStatus, 'VERIFIED_OUTSIDE');
    });

    it('GATEWAY INTEGRATION: should support production GatewayNetworkProvider', async () => {
      const gatewayId = 'GATEWAY-HOSTEL-A-01';
      const gatewaySecret = 'prod_campus_secret_key_2026';

      const prodGatewayProvider = new GatewayNetworkProvider({
        trustedGateways: { [gatewayId]: gatewaySecret },
        hostelSubnetMap: {
          'a0000000-0000-0000-0000-000000000001': ['10.42.0.0/16'],
        },
        enforceSubnetCheck: true,
      });

      // Gateway App using the same authRepo & clean presenceRepo
      const gatewayPresenceRepo = new InMemoryPresenceRepository();
      const gatewayApp = createApp(authRepo, gatewayPresenceRepo, prodGatewayProvider);

      const loginRes = await request(gatewayApp)
        .post('/auth/login')
        .send(testResidentCredentials);
      assert.equal(loginRes.status, 200);
      const token = loginRes.body.data.accessToken;

      // 1. Negative: Attempt verification without gateway handshake headers
      const startRes1 = await request(gatewayApp)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      const failRes = await request(gatewayApp)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${token}`)
        .set('x-forwarded-for', '10.42.1.50')
        .send({
          sessionId: startRes1.body.data.sessionId,
          challengeNonce: startRes1.body.data.challengeNonce,
          biometricConfirmed: true,
        });

      assert.equal(failRes.status, 403);
      assert.equal(failRes.body.error.code, 'NETWORK_NOT_AUTHORIZED');

      // 2. Positive: Verification with valid gateway handshake headers + IP
      const startRes2 = await request(gatewayApp)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      const successRes = await request(gatewayApp)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${token}`)
        .set('x-forwarded-for', '10.42.1.50')
        .set('x-hostel-gateway-id', gatewayId)
        .set('x-hostel-gateway-token', gatewaySecret)
        .send({
          sessionId: startRes2.body.data.sessionId,
          challengeNonce: startRes2.body.data.challengeNonce,
          biometricConfirmed: true,
        });

      assert.equal(successRes.status, 200);
      assert.equal(successRes.body.data.status, 'VERIFIED_INSIDE');
    });

    it('OUTAGE FAIL-SAFE: should reject verification during provider outage', async () => {
      const mockOutageProvider = new MockNetworkProvider({ simulateOutage: true });
      const outagePresenceRepo = new InMemoryPresenceRepository();
      const outageApp = createApp(authRepo, outagePresenceRepo, mockOutageProvider);

      const loginRes = await request(outageApp)
        .post('/auth/login')
        .send(testResidentCredentials);
      assert.equal(loginRes.status, 200);
      const token = loginRes.body.data.accessToken;

      const startRes = await request(outageApp)
        .post('/presence/entry/start')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      const res = await request(outageApp)
        .post('/presence/entry/verify')
        .set('Authorization', `Bearer ${token}`)
        .set('x-forwarded-for', '10.42.1.10')
        .send({
          sessionId: startRes.body.data.sessionId,
          challengeNonce: startRes.body.data.challengeNonce,
          biometricConfirmed: true,
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'NETWORK_NOT_AUTHORIZED');
    });
  });
});
