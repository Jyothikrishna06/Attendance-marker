import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth/error_codes.dart' as auth_error;
import 'biometric_result.dart';

/// Contract for operating system biometric authentication.
abstract class IBiometricService {
  /// Checks whether the hardware sensor is available and operational.
  Future<bool> isBiometricAvailable();

  /// Checks whether at least one biometric identity (fingerprint/face) is enrolled.
  Future<bool> hasEnrolledBiometrics();

  /// Returns list of available biometric modalities on the device ('fingerprint', 'face', 'iris', 'strong', 'weak').
  Future<List<String>> getAvailableBiometricTypes();

  /// Prompts the resident with the OS native biometric dialog.
  ///
  /// **Privacy Guarantee**:
  /// Biometric evaluation is conducted exclusively inside the hardware TEE / Secure Enclave.
  /// Only an attestation boolean is returned to this service.
  Future<BiometricResult> authenticate({
    required String localizedReason,
    bool biometricOnly = true,
  });
}

/// Production implementation of [IBiometricService] using OS-native BiometricPrompt (Android)
/// and LocalAuthentication / LAContext (iOS).
class LocalAuthBiometricService implements IBiometricService {
  final LocalAuthentication _auth;

  LocalAuthBiometricService({LocalAuthentication? auth})
      : _auth = auth ?? LocalAuthentication();

  @override
  Future<bool> isBiometricAvailable() async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final isSupported = await _auth.isDeviceSupported();
      return canCheck || isSupported;
    } on PlatformException {
      return false;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> hasEnrolledBiometrics() async {
    try {
      final biometrics = await _auth.getAvailableBiometrics();
      return biometrics.isNotEmpty;
    } on PlatformException {
      return false;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<List<String>> getAvailableBiometricTypes() async {
    try {
      final biometrics = await _auth.getAvailableBiometrics();
      return biometrics.map((type) => type.name).toList();
    } on PlatformException {
      return [];
    } catch (_) {
      return [];
    }
  }

  @override
  Future<BiometricResult> authenticate({
    required String localizedReason,
    bool biometricOnly = true,
  }) async {
    try {
      // 1. Pre-flight Check: Hardware availability
      final available = await isBiometricAvailable();
      if (!available) {
        return BiometricResult.notAvailable();
      }

      // 2. Pre-flight Check: Enrolled biometrics
      final enrolled = await hasEnrolledBiometrics();
      if (!enrolled) {
        return BiometricResult.notEnrolled();
      }

      // 3. Trigger OS-Level Biometric Dialog
      final authenticated = await _auth.authenticate(
        localizedReason: localizedReason,
        options: AuthenticationOptions(
          biometricOnly: biometricOnly,
          stickyAuth: true,
          useErrorDialogs: false, // App manages custom branded error UI
        ),
      );

      if (authenticated) {
        return BiometricResult.success();
      } else {
        // If authenticate returns false without throwing PlatformException,
        // it indicates user dismissal / cancellation of the OS prompt.
        return BiometricResult.cancelled();
      }
    } on PlatformException catch (e) {
      return _mapPlatformException(e);
    } catch (e) {
      return BiometricResult.error('Unexpected biometric error: $e');
    }
  }

  /// Maps native Android/iOS error codes to typed [BiometricResult] responses.
  BiometricResult _mapPlatformException(PlatformException e) {
    switch (e.code) {
      case auth_error.notAvailable:
      case 'NotAvailable':
        return BiometricResult.notAvailable();

      case auth_error.notEnrolled:
      case 'NotEnrolled':
        return BiometricResult.notEnrolled();

      case auth_error.lockedOut:
      case 'LockedOut':
        return BiometricResult.lockedOut(permanently: false);

      case auth_error.permanentlyLockedOut:
      case 'PermanentlyLockedOut':
        return BiometricResult.lockedOut(permanently: true);

      case 'UserCanceled':
      case 'UserCancel':
      case 'auth_messages.userCanceled':
        return BiometricResult.cancelled();

      default:
        // Handle common message patterns if code is generic
        final msg = e.message?.toLowerCase() ?? '';
        if (msg.contains('cancel')) {
          return BiometricResult.cancelled();
        } else if (msg.contains('lockout') || msg.contains('locked')) {
          return BiometricResult.lockedOut(permanently: msg.contains('permanent'));
        }
        return BiometricResult.error(
          e.message ?? 'Biometric verification failed due to system error',
          e.code,
        );
    }
  }
}
