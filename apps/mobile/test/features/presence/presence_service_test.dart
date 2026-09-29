import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hostel_curfew_mobile/core/biometrics/mock_biometric_service.dart';
import 'package:hostel_curfew_mobile/core/network/api_client.dart';
import 'package:hostel_curfew_mobile/core/storage/secure_storage_service.dart';
import 'package:hostel_curfew_mobile/features/presence/models/presence_model.dart';
import 'package:hostel_curfew_mobile/features/presence/services/presence_service.dart';

void main() {
  group('PresenceService Unit Tests', () {
    late InMemorySecureStorageService storage;
    late MockBiometricService mockBiometricService;

    setUp(() async {
      storage = InMemorySecureStorageService();
      await storage.setAccessToken('mock_valid_resident_token');
      mockBiometricService = MockBiometricService();
    });

    test('should complete full verification flow when biometrics succeed', () async {
      bool verifyEndpointCalled = false;

      final mockClient = MockClient((request) async {
        if (request.url.path == '/presence/entry/start') {
          return http.Response(
            jsonEncode({
              'data': {
                'sessionId': 'session-uuid-12345',
                'challengeNonce': 'challenge-nonce-secret-proof-67890',
                'challengeIssuedAt': '2026-09-29T20:00:00.000Z',
                'challengeExpiresAt': '2026-09-29T20:01:00.000Z',
                'deviceId': 'device-uuid-1',
                'residentId': 'resident-uuid-1',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/presence/entry/verify') {
          verifyEndpointCalled = true;
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['sessionId'], 'session-uuid-12345');
          expect(body['challengeNonce'], 'challenge-nonce-secret-proof-67890');
          expect(body['biometricConfirmed'], true);
          expect(body['networkMetadata']['clientSsid'], 'HostelAryabhata_WiFi');

          return http.Response(
            jsonEncode({
              'data': {
                'eventId': 'event-uuid-999',
                'residentId': 'resident-uuid-1',
                'eventType': 'ENTRY',
                'status': 'VERIFIED_INSIDE',
                'serverTimestamp': '2026-09-29T20:00:15.000Z',
                'curfewDate': '2026-09-29',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(
        httpClient: mockClient,
        storage: storage,
        baseUrl: 'http://localhost:4000',
      );

      final presenceService = PresenceService(
        apiClient: apiClient,
        biometricService: mockBiometricService,
      );

      final result = await presenceService.verifyEntryFlow(
        clientSsid: 'HostelAryabhata_WiFi',
      );

      expect(result.status, PresenceFlowStatus.verified);
      expect(result.isSuccess, true);
      expect(result.eventId, 'event-uuid-999');
      expect(result.serverTimestamp, '2026-09-29T20:00:15.000Z');
      expect(mockBiometricService.authenticateCallCount, 1);
      expect(verifyEndpointCalled, true);
    });

    test('SECURITY: should ABORT flow and NOT call /presence/entry/verify when biometric is cancelled', () async {
      bool verifyEndpointCalled = false;

      final mockClient = MockClient((request) async {
        if (request.url.path == '/presence/entry/start') {
          return http.Response(
            jsonEncode({
              'data': {
                'sessionId': 'session-uuid-cancel-test',
                'challengeNonce': 'challenge-nonce-cancel-test',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/presence/entry/verify') {
          verifyEndpointCalled = true;
          return http.Response('Should not be called', 500);
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(
        httpClient: mockClient,
        storage: storage,
        baseUrl: 'http://localhost:4000',
      );

      mockBiometricService.setCancelled('User dismissed biometric prompt');

      final presenceService = PresenceService(
        apiClient: apiClient,
        biometricService: mockBiometricService,
      );

      final result = await presenceService.verifyEntryFlow();

      expect(result.status, PresenceFlowStatus.biometricAborted);
      expect(result.isSuccess, false);
      expect(result.message, 'User dismissed biometric prompt');
      expect(verifyEndpointCalled, false, reason: 'Verification endpoint MUST NOT be called when biometrics are cancelled');
    });

    test('SECURITY: should ABORT flow and NOT call /presence/entry/verify when biometric mismatch occurs', () async {
      bool verifyEndpointCalled = false;

      final mockClient = MockClient((request) async {
        if (request.url.path == '/presence/entry/start') {
          return http.Response(
            jsonEncode({
              'data': {
                'sessionId': 'session-uuid-fail-test',
                'challengeNonce': 'challenge-nonce-fail-test',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/presence/entry/verify') {
          verifyEndpointCalled = true;
          return http.Response('Should not be called', 500);
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(
        httpClient: mockClient,
        storage: storage,
        baseUrl: 'http://localhost:4000',
      );

      mockBiometricService.setFailed('Biometric identity did not match');

      final presenceService = PresenceService(
        apiClient: apiClient,
        biometricService: mockBiometricService,
      );

      final result = await presenceService.verifyEntryFlow();

      expect(result.status, PresenceFlowStatus.biometricAborted);
      expect(result.isSuccess, false);
      expect(result.message, 'Biometric identity did not match');
      expect(verifyEndpointCalled, false);
    });

    test('should handle HTTP 403 NETWORK_NOT_AUTHORIZED from backend gracefully', () async {
      final mockClient = MockClient((request) async {
        if (request.url.path == '/presence/entry/start') {
          return http.Response(
            jsonEncode({
              'data': {
                'sessionId': 'session-uuid-net-fail',
                'challengeNonce': 'challenge-nonce-net-fail',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/presence/entry/verify') {
          return http.Response(
            jsonEncode({
              'error': {
                'code': 'NETWORK_NOT_AUTHORIZED',
                'message': 'Network verification failed: Device is not connected to an authorized hostel network.',
              }
            }),
            403,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(
        httpClient: mockClient,
        storage: storage,
        baseUrl: 'http://localhost:4000',
      );

      mockBiometricService.setSuccess();

      final presenceService = PresenceService(
        apiClient: apiClient,
        biometricService: mockBiometricService,
      );

      final result = await presenceService.verifyEntryFlow();

      expect(result.status, PresenceFlowStatus.networkUnauthorized);
      expect(result.isSuccess, false);
      expect(result.message, contains('authorized hostel Wi-Fi network'));
    });

    test('should record departure exit event successfully', () async {
      final mockClient = MockClient((request) async {
        if (request.url.path == '/presence/exit') {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['reason'], 'Studying at campus library');

          return http.Response(
            jsonEncode({
              'data': {
                'eventId': 'exit-event-uuid-1',
                'residentId': 'resident-uuid-1',
                'eventType': 'EXIT',
                'status': 'VERIFIED_OUTSIDE',
                'serverTimestamp': '2026-09-29T21:15:00.000Z',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(
        httpClient: mockClient,
        storage: storage,
        baseUrl: 'http://localhost:4000',
      );

      final presenceService = PresenceService(
        apiClient: apiClient,
        biometricService: mockBiometricService,
      );

      final exitData = await presenceService.recordExit(reason: 'Studying at campus library');
      expect(exitData['status'], 'VERIFIED_OUTSIDE');
      expect(exitData['eventType'], 'EXIT');
    });
  });
}
