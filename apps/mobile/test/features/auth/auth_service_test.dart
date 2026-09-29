import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hostel_curfew_mobile/core/network/api_client.dart';
import 'package:hostel_curfew_mobile/core/storage/secure_storage_service.dart';
import 'package:hostel_curfew_mobile/features/auth/services/auth_service.dart';

void main() {
  group('AuthService Unit Tests', () {
    late InMemorySecureStorageService storage;

    setUp(() {
      storage = InMemorySecureStorageService();
    });

    test('login() should persist access & refresh tokens and return active session', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, '/auth/login');
        final body = jsonDecode(request.body);
        expect(body['email'], 'aarav.patel@student.edu');
        expect(body['password'], 'SecurePass123!');

        return http.Response(
          jsonEncode({
            'data': {
              'accessToken': 'jwt_access_aarav',
              'refreshToken': 'jwt_refresh_aarav',
              'expiresIn': '15m',
              'user': {
                'id': 'user_aarav_id',
                'name': 'Aarav Patel',
                'email': 'aarav.patel@student.edu',
                'role': 'RESIDENT',
                'status': 'ACTIVE',
                'residentProfile': {
                  'id': 'res_aarav_id',
                  'rollNumber': 'CS2026-001',
                  'hostelId': 'hostel_a_id',
                  'roomId': 'room_101_id',
                },
                'activeDevice': {
                  'id': 'device_aarav_id',
                  'deviceIdentifier': 'DEV-PIXEL-8',
                  'deviceModel': 'Google Pixel 8',
                  'status': 'ACTIVE',
                }
              }
            }
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(httpClient: mockClient, storage: storage);
      final authService = AuthService(apiClient: apiClient, storage: storage);

      final session = await authService.login('aarav.patel@student.edu', 'SecurePass123!');

      expect(session.accessToken, 'jwt_access_aarav');
      expect(session.refreshToken, 'jwt_refresh_aarav');
      expect(session.user.name, 'Aarav Patel');
      expect(session.user.hasActiveDevice, true);

      // Verify stored tokens
      expect(await storage.getAccessToken(), 'jwt_access_aarav');
      expect(await storage.getRefreshToken(), 'jwt_refresh_aarav');
    });

    test('activate() should call /auth/activate and return success message', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, '/auth/activate');
        final body = jsonDecode(request.body);
        expect(body['email'], 'rohan.verma@student.edu');
        expect(body['activationToken'], 'ACTIVATE_TOKEN_123');

        return http.Response(
          jsonEncode({
            'data': {'message': 'Account successfully activated.'}
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(httpClient: mockClient, storage: storage);
      final authService = AuthService(apiClient: apiClient, storage: storage);

      final message = await authService.activate(
        email: 'rohan.verma@student.edu',
        activationToken: 'ACTIVATE_TOKEN_123',
        newPassword: 'NewPassword123!',
      );

      expect(message, 'Account successfully activated.');
    });

    test('logout() should revoke token and clear secure storage', () async {
      await storage.setAccessToken('old_token');
      await storage.setRefreshToken('old_refresh');

      final mockClient = MockClient((request) async {
        expect(request.url.path, '/auth/logout');
        return http.Response(
          jsonEncode({'data': {'message': 'Logged out successfully'}}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(httpClient: mockClient, storage: storage);
      final authService = AuthService(apiClient: apiClient, storage: storage);

      await authService.logout();

      expect(await storage.getAccessToken(), null);
      expect(await storage.getRefreshToken(), null);
    });
  });
}
