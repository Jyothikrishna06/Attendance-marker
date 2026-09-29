import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

class ApiConstants {
  // Determine appropriate localhost IP based on platform
  static String get defaultBaseUrl {
    if (kIsWeb) {
      return 'http://localhost:4000';
    }
    try {
      if (Platform.isAndroid) {
        // Standard Android emulator loopback alias to host machine
        return 'http://10.0.2.2:4000';
      }
    } catch (_) {
      // Fallback if platform inspection fails
    }
    return 'http://localhost:4000';
  }

  // Auth endpoints
  static const String login = '/auth/login';
  static const String refresh = '/auth/refresh';
  static const String logout = '/auth/logout';
  static const String activate = '/auth/activate';
  static const String registerDevice = '/auth/device/register';

  // Resident & Presence endpoints
  static const String residentHome = '/resident/home';
  static const String residentProfile = '/resident/profile';
  static const String presenceStatus = '/presence/me';
  static const String presenceEntryStart = '/presence/entry/start';
  static const String presenceEntryVerify = '/presence/entry/verify';
  static const String presenceExit = '/presence/exit';
  static const String leaveRequests = '/leave';

  // Secure storage keys
  static const String keyAccessToken = 'auth_access_token';
  static const String keyRefreshToken = 'auth_refresh_token';
  static const String keyCachedUser = 'auth_cached_user';
  static const String keyDeviceIdentifier = 'auth_device_identifier';
}
