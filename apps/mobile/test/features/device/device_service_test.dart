import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hostel_curfew_mobile/core/network/api_client.dart';
import 'package:hostel_curfew_mobile/core/network/api_exceptions.dart';
import 'package:hostel_curfew_mobile/core/storage/secure_storage_service.dart';
import 'package:hostel_curfew_mobile/features/device/services/device_service.dart';

void main() {
  group('DeviceService Unit Tests', () {
    late InMemorySecureStorageService storage;

    setUp(() {
      storage = InMemorySecureStorageService();
    });

    test('registerDevice() should submit device fingerprint and return active device record', () async {
      await storage.setAccessToken('valid_jwt_resident_token');

      final mockClient = MockClient((request) async {
        expect(request.url.path, '/auth/device/register');
        expect(request.headers['Authorization'], 'Bearer valid_jwt_resident_token');

        final body = jsonDecode(request.body);
        expect(body['deviceIdentifier'], 'TEST-DEVICE-ID-999');
        expect(body['deviceModel'], 'OnePlus 12');

        return http.Response(
          jsonEncode({
            'data': {
              'device': {
                'id': 'device_uuid_123',
                'deviceIdentifier': 'TEST-DEVICE-ID-999',
                'deviceModel': 'OnePlus 12',
                'osName': 'ANDROID',
                'osVersion': '14.0',
                'status': 'ACTIVE',
              }
            },
            'message': 'Device registered successfully'
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(httpClient: mockClient, storage: storage);
      final deviceService = DeviceService(apiClient: apiClient);

      final device = await deviceService.registerDevice(
        deviceIdentifier: 'TEST-DEVICE-ID-999',
        deviceModel: 'OnePlus 12',
        osName: 'ANDROID',
        osVersion: '14.0',
      );

      expect(device.id, 'device_uuid_123');
      expect(device.deviceIdentifier, 'TEST-DEVICE-ID-999');
      expect(device.isActive, true);
    });

    test('registerDevice() should throw ConflictException if device already exists or resident has active device', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'error': {
              'code': 'CONFLICT',
              'message': 'Resident already possesses an active registered device.',
            }
          }),
          409,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(httpClient: mockClient, storage: storage);
      final deviceService = DeviceService(apiClient: apiClient);

      expect(
        () => deviceService.registerDevice(
          deviceIdentifier: 'SECOND-DEVICE-ATTEMPT',
          deviceModel: 'Tablet',
          osName: 'ANDROID',
          osVersion: '13.0',
        ),
        throwsA(isA<ConflictException>().having(
          (e) => e.code,
          'code',
          'CONFLICT',
        )),
      );
    });
  });
}
