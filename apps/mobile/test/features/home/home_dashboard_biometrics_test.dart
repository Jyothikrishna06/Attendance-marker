import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hostel_curfew_mobile/core/biometrics/mock_biometric_service.dart';
import 'package:hostel_curfew_mobile/core/network/api_client.dart';
import 'package:hostel_curfew_mobile/core/storage/secure_storage_service.dart';
import 'package:hostel_curfew_mobile/features/auth/models/user_model.dart';
import 'package:hostel_curfew_mobile/features/auth/services/auth_service.dart';
import 'package:hostel_curfew_mobile/features/auth/state/auth_notifier.dart';
import 'package:hostel_curfew_mobile/features/home/presentation/home_dashboard_screen.dart';
import 'package:hostel_curfew_mobile/features/presence/services/presence_service.dart';

void main() {
  group('HomeDashboardScreen Biometric Verification Widget Tests', () {
    late InMemorySecureStorageService storage;
    late MockBiometricService mockBiometricService;
    late AuthNotifier authNotifier;

    final mockUser = User(
      id: 'c0000000-0000-0000-0000-000000000003',
      name: 'Aarav Patel',
      email: 'aarav.patel@student.edu',
      role: 'RESIDENT',
      status: 'ACTIVE',
      activeDevice: Device(
        id: 'e0000000-0000-0000-0000-000000000001',
        deviceIdentifier: 'FINGERPRINT-AARAV-PIXEL8',
        deviceModel: 'Google Pixel 8',
        status: 'ACTIVE',
      ),
    );

    setUp(() async {
      storage = InMemorySecureStorageService();
      await storage.setAccessToken('mock_resident_access_token');
      mockBiometricService = MockBiometricService();

      final authService = AuthService(
        apiClient: ApiClient(storage: storage),
        storage: storage,
      );
      authNotifier = AuthNotifier(authService: authService);
      authNotifier.updateUser(mockUser);
    });

    Widget createTestWidget({required ApiClient apiClient}) {
      final presenceService = PresenceService(
        apiClient: apiClient,
        biometricService: mockBiometricService,
      );

      return MaterialApp(
        home: HomeDashboardScreen(
          authNotifier: authNotifier,
          apiClient: apiClient,
          presenceService: presenceService,
          biometricService: mockBiometricService,
        ),
      );
    }

    testWidgets('should render initial curfew dashboard with active device and verify button', (tester) async {
      final mockClient = MockClient((request) async {
        if (request.url.path == '/presence/me') {
          return http.Response(
            jsonEncode({
              'data': {
                'currentStatus': 'PENDING_VERIFICATION',
                'lastEventTimestamp': null,
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(httpClient: mockClient, storage: storage);

      await tester.pumpWidget(createTestWidget(apiClient: apiClient));
      await tester.pumpAndSettle();

      expect(find.text('Hostel Curfew Portal'), findsOneWidget);
      expect(find.text("Tonight's Curfew Status"), findsOneWidget);
      expect(find.text('Google Pixel 8'), findsOneWidget);
      expect(find.text('Hardware Fingerprint Verified'), findsOneWidget);
      expect(find.text('Verify Presence Now'), findsOneWidget);
    });

    testWidgets('POSITIVE FLOW: should update status to VERIFIED INSIDE when biometrics succeed', (tester) async {
      mockBiometricService.setSuccess();

      final mockClient = MockClient((request) async {
        if (request.url.path == '/presence/me') {
          return http.Response(
            jsonEncode({
              'data': {
                'currentStatus': 'PENDING_VERIFICATION',
                'lastEventTimestamp': null,
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/presence/entry/start') {
          return http.Response(
            jsonEncode({
              'data': {
                'sessionId': 'session-test-success',
                'challengeNonce': 'challenge-nonce-success-12345',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/presence/entry/verify') {
          return http.Response(
            jsonEncode({
              'data': {
                'eventId': 'event-1',
                'residentId': 'resident-1',
                'eventType': 'ENTRY',
                'status': 'VERIFIED_INSIDE',
                'serverTimestamp': '2026-09-29T21:00:00.000Z',
                'curfewDate': '2026-09-29',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(httpClient: mockClient, storage: storage);

      await tester.pumpWidget(createTestWidget(apiClient: apiClient));
      await tester.pumpAndSettle();

      // Tap Verify Presence Now
      await tester.tap(find.text('Verify Presence Now'));
      await tester.pumpAndSettle();

      // Status badge updates to VERIFIED INSIDE
      expect(find.text('VERIFIED INSIDE'), findsOneWidget);
      // Success snackbar appears
      expect(find.text('Presence verified successfully: Inside Hostel'), findsOneWidget);
      // Action button updates to Record Hostel Departure
      expect(find.text('Record Hostel Departure (Exit)'), findsOneWidget);
    });

    testWidgets('CANCELLATION: should show cancellation snackbar and keep status when resident cancels biometric prompt', (tester) async {
      mockBiometricService.setCancelled('Biometric verification cancelled by resident.');

      final mockClient = MockClient((request) async {
        if (request.url.path == '/presence/me') {
          return http.Response(
            jsonEncode({
              'data': {
                'currentStatus': 'PENDING_VERIFICATION',
                'lastEventTimestamp': null,
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/presence/entry/start') {
          return http.Response(
            jsonEncode({
              'data': {
                'sessionId': 'session-cancel-1',
                'challengeNonce': 'nonce-cancel-1',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(httpClient: mockClient, storage: storage);

      await tester.pumpWidget(createTestWidget(apiClient: apiClient));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Verify Presence Now'));
      await tester.pumpAndSettle();

      // Cancellation feedback appears
      expect(find.text('Biometric verification cancelled by resident.'), findsOneWidget);
      // Status badge does not update to VERIFIED INSIDE
      expect(find.text('VERIFIED INSIDE'), findsNothing);
    });

    testWidgets('LOCKOUT: should display security dialog when biometric sensor is locked out', (tester) async {
      mockBiometricService.setLockedOut(permanently: false);

      final mockClient = MockClient((request) async {
        if (request.url.path == '/presence/me') {
          return http.Response(
            jsonEncode({
              'data': {'currentStatus': 'PENDING_VERIFICATION'}
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/presence/entry/start') {
          return http.Response(
            jsonEncode({
              'data': {'sessionId': 'session-lock', 'challengeNonce': 'nonce-lock'}
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(httpClient: mockClient, storage: storage);

      await tester.pumpWidget(createTestWidget(apiClient: apiClient));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Verify Presence Now'));
      await tester.pumpAndSettle();

      // Lockout dialog displayed
      expect(find.text('Biometric Sensor Locked Out'), findsOneWidget);
      expect(find.textContaining('temporarily locked'), findsOneWidget);

      // Dismiss dialog
      await tester.tap(find.text('Dismiss'));
      await tester.pumpAndSettle();

      expect(find.text('Biometric Sensor Locked Out'), findsNothing);
    });

    testWidgets('NETWORK REJECTION: should display dialog when backend returns 403 NETWORK_NOT_AUTHORIZED', (tester) async {
      mockBiometricService.setSuccess();

      final mockClient = MockClient((request) async {
        if (request.url.path == '/presence/me') {
          return http.Response(
            jsonEncode({
              'data': {'currentStatus': 'PENDING_VERIFICATION'}
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/presence/entry/start') {
          return http.Response(
            jsonEncode({
              'data': {'sessionId': 'session-net', 'challengeNonce': 'nonce-net'}
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/presence/entry/verify') {
          return http.Response(
            jsonEncode({
              'error': {
                'code': 'NETWORK_NOT_AUTHORIZED',
                'message': 'Network verification failed: You are not connected to the authorized hostel Wi-Fi network.',
              }
            }),
            403,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(httpClient: mockClient, storage: storage);

      await tester.pumpWidget(createTestWidget(apiClient: apiClient));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Verify Presence Now'));
      await tester.pumpAndSettle();

      // Network required dialog displayed
      expect(find.text('Hostel Wi-Fi Required'), findsOneWidget);
      expect(find.textContaining('authorized hostel Wi-Fi network'), findsOneWidget);

      await tester.tap(find.text('Dismiss'));
      await tester.pumpAndSettle();
    });

    testWidgets('EXIT FLOW: should record hostel departure when confirmed by resident', (tester) async {
      final mockClient = MockClient((request) async {
        if (request.url.path == '/presence/me') {
          return http.Response(
            jsonEncode({
              'data': {
                'currentStatus': 'VERIFIED_INSIDE',
                'lastEventTimestamp': '2026-09-29T20:15:00.000Z',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/presence/exit') {
          return http.Response(
            jsonEncode({
              'data': {
                'eventId': 'exit-id-1',
                'eventType': 'EXIT',
                'status': 'VERIFIED_OUTSIDE',
              }
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(httpClient: mockClient, storage: storage);

      await tester.pumpWidget(createTestWidget(apiClient: apiClient));
      await tester.pumpAndSettle();

      expect(find.text('VERIFIED INSIDE'), findsOneWidget);
      expect(find.text('Record Hostel Departure (Exit)'), findsOneWidget);

      // Tap exit button
      await tester.tap(find.text('Record Hostel Departure (Exit)'));
      await tester.pumpAndSettle();

      // Confirmation dialog appears
      expect(find.text('Record Hostel Departure'), findsOneWidget);

      // Confirm exit
      await tester.tap(find.text('Confirm Departure'));
      await tester.pumpAndSettle();

      // Status updates to VERIFIED OUTSIDE
      expect(find.text('VERIFIED OUTSIDE'), findsOneWidget);
      expect(find.text('Hostel departure recorded: Status is Outside Hostel'), findsOneWidget);
    });
  });
}
