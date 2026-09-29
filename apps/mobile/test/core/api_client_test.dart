import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hostel_curfew_mobile/core/network/api_client.dart';
import 'package:hostel_curfew_mobile/core/network/api_exceptions.dart';
import 'package:hostel_curfew_mobile/core/storage/secure_storage_service.dart';

void main() {
  group('ApiClient Core Unit Tests', () {
    late InMemorySecureStorageService storage;

    setUp(() {
      storage = InMemorySecureStorageService();
    });

    test('should inject Authorization Bearer header when authenticated', () async {
      await storage.setAccessToken('test_mock_jwt_token_123');

      final mockClient = MockClient((request) async {
        expect(request.headers['Authorization'], 'Bearer test_mock_jwt_token_123');
        return http.Response(
          jsonEncode({'data': {'message': 'Success'}}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        httpClient: mockClient,
        storage: storage,
        baseUrl: 'http://localhost:4000',
      );

      final res = await apiClient.get('/resident/home');
      expect(res['data']['message'], 'Success');
    });

    test('should attempt token refresh on 401 and retry request upon successful refresh', () async {
      await storage.setAccessToken('expired_access_token');
      await storage.setRefreshToken('valid_refresh_token');

      int requestCount = 0;

      final mockClient = MockClient((request) async {
        if (request.url.path == '/resident/home') {
          requestCount++;
          if (requestCount == 1) {
            // Initial call fails with 401
            return http.Response(
              jsonEncode({
                'error': {'code': 'TOKEN_EXPIRED', 'message': 'Access token has expired'}
              }),
              401,
              headers: {'content-type': 'application/json'},
            );
          } else {
            // Retried call with new access token
            expect(request.headers['Authorization'], 'Bearer new_rotated_access_token');
            return http.Response(
              jsonEncode({'data': {'status': 'VERIFIED_INSIDE'}}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
        } else if (request.url.path == '/auth/refresh') {
          // Token refresh call
          return http.Response(
            jsonEncode({
              'data': {
                'accessToken': 'new_rotated_access_token',
                'refreshToken': 'new_rotated_refresh_token',
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

      final res = await apiClient.get('/resident/home');
      expect(res['data']['status'], 'VERIFIED_INSIDE');
      expect(await storage.getAccessToken(), 'new_rotated_access_token');
      expect(await storage.getRefreshToken(), 'new_rotated_refresh_token');
      expect(requestCount, 2);
    });

    test('should parse RFC 7807 error envelopes and throw typed ApiException', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'error': {
              'code': 'INVALID_CREDENTIALS',
              'message': 'Invalid email or password credentials',
            }
          }),
          401,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        httpClient: mockClient,
        storage: storage,
        baseUrl: 'http://localhost:4000',
      );

      expect(
        () => apiClient.post('/auth/login', requiresAuth: false),
        throwsA(isA<UnauthorizedException>().having(
          (e) => e.code,
          'code',
          'INVALID_CREDENTIALS',
        )),
      );
    });
  });
}
