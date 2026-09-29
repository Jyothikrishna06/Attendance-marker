import 'biometric_result.dart';
import 'biometric_service.dart';

/// In-memory mock implementation of [IBiometricService] for unit and widget testing.
/// Provides fine-grained control over simulated biometric outcomes.
class MockBiometricService implements IBiometricService {
  bool isHardwareAvailable;
  bool hasBiometricsEnrolled;
  List<String> mockBiometricTypes;
  BiometricResult nextResult;

  int authenticateCallCount = 0;
  String? lastLocalizedReason;
  bool? lastBiometricOnly;

  MockBiometricService({
    this.isHardwareAvailable = true,
    this.hasBiometricsEnrolled = true,
    this.mockBiometricTypes = const ['fingerprint', 'face'],
    BiometricResult? initialResult,
  }) : nextResult = initialResult ?? BiometricResult.success();

  void setSuccess([String message = 'Biometric identity verified successfully']) {
    isHardwareAvailable = true;
    hasBiometricsEnrolled = true;
    nextResult = BiometricResult.success(message);
  }

  void setCancelled([String message = 'Biometric verification cancelled by resident']) {
    nextResult = BiometricResult.cancelled(message);
  }

  void setFailed([String message = 'Biometric identity does not match. Please try again.']) {
    nextResult = BiometricResult.failed(message);
  }

  void setUnavailable([String message = 'Biometric hardware sensor is unavailable on this device.']) {
    isHardwareAvailable = false;
    nextResult = BiometricResult.notAvailable(message);
  }

  void setNotEnrolled([
    String message = 'No biometrics enrolled. Please register your fingerprint or face in device settings.',
  ]) {
    hasBiometricsEnrolled = false;
    nextResult = BiometricResult.notEnrolled(message);
  }

  void setLockedOut({required bool permanently}) {
    nextResult = BiometricResult.lockedOut(permanently: permanently);
  }

  void setError(String message, [String? code]) {
    nextResult = BiometricResult.error(message, code);
  }

  @override
  Future<bool> isBiometricAvailable() async {
    return isHardwareAvailable;
  }

  @override
  Future<bool> hasEnrolledBiometrics() async {
    return hasBiometricsEnrolled;
  }

  @override
  Future<List<String>> getAvailableBiometricTypes() async {
    return mockBiometricTypes;
  }

  @override
  Future<BiometricResult> authenticate({
    required String localizedReason,
    bool biometricOnly = true,
  }) async {
    authenticateCallCount++;
    lastLocalizedReason = localizedReason;
    lastBiometricOnly = biometricOnly;

    if (!isHardwareAvailable) {
      return BiometricResult.notAvailable();
    }

    if (!hasBiometricsEnrolled) {
      return BiometricResult.notEnrolled();
    }

    return nextResult;
  }
}
