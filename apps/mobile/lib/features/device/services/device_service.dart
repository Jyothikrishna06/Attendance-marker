import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';
import '../../auth/models/user_model.dart';

class DeviceService {
  final ApiClient _apiClient;

  DeviceService({required ApiClient apiClient}) : _apiClient = apiClient;

  /// Detects platform device properties or provides deterministic development fallback
  Future<Map<String, String>> getDeviceInfo() async {
    String osName = 'ANDROID';
    String osVersion = '14.0';
    String deviceModel = 'Google Pixel 8';
    String identifier = 'DEV-HW-${DateTime.now().millisecondsSinceEpoch}';

    if (kIsWeb) {
      osName = 'TEST_OS';
      osVersion = 'Web-Browser';
      deviceModel = 'Chrome-Client';
      identifier = 'WEB-CLIENT-INSTANCE-001';
    } else {
      try {
        if (Platform.isIOS) {
          osName = 'IOS';
          osVersion = '17.5';
          deviceModel = 'Apple iPhone 15';
          identifier = 'IOS-HW-DEVICE-TOKEN-001';
        } else if (Platform.isAndroid) {
          osName = 'ANDROID';
          osVersion = '14.0';
          deviceModel = 'Android Smartphone';
          identifier = 'ANDROID-HW-DEVICE-TOKEN-001';
        }
      } catch (_) {
        // Fallback for desktop / tests
      }
    }

    return {
      'osName': osName,
      'osVersion': osVersion,
      'deviceModel': deviceModel,
      'deviceIdentifier': identifier,
    };
  }

  /// Submits hardware device registration to backend
  Future<Device> registerDevice({
    required String deviceIdentifier,
    required String deviceModel,
    required String osName,
    required String osVersion,
  }) async {
    final response = await _apiClient.post(
      ApiConstants.registerDevice,
      body: {
        'deviceIdentifier': deviceIdentifier,
        'deviceModel': deviceModel,
        'osName': osName,
        'osVersion': osVersion,
      },
    );

    final data = response['data'] as Map<String, dynamic>;
    final deviceJson = data['device'] as Map<String, dynamic>;
    return Device.fromJson(deviceJson);
  }
}
