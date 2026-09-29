/// Biometric verification result status types.
enum BiometricResultType {
  /// Biometric verification succeeded with a valid hardware attestation signal.
  success,

  /// Resident voluntarily cancelled the OS biometric prompt.
  cancelled,

  /// Biometric sensor rejected the resident's fingerprint/face (did not match).
  failed,

  /// Device hardware does not support biometrics or biometric sensor is disabled.
  notAvailable,

  /// No biometrics (fingerprint/face) are enrolled in device settings.
  notEnrolled,

  /// Biometric sensor temporarily locked out due to too many failed attempts (e.g. 30s delay).
  lockedOutTemporarily,

  /// Biometric sensor permanently locked out until primary device PIN/passcode is entered.
  lockedOutPermanently,

  /// An unhandled platform or hardware exception occurred.
  otherError,
}

/// Represents the immutable outcome of an OS-level biometric authentication prompt.
///
/// **Privacy Guarantee**:
/// This object contains only high-level status signals and user-facing messages.
/// Under NO circumstances are raw biometric images, minutiae data, or hardware
/// biometric templates captured, stored, or processed.
class BiometricResult {
  final bool success;
  final BiometricResultType type;
  final String message;
  final String? errorCode;

  const BiometricResult({
    required this.success,
    required this.type,
    required this.message,
    this.errorCode,
  });

  /// Biometric authentication succeeded.
  factory BiometricResult.success([String message = 'Biometric identity verified successfully']) {
    return BiometricResult(
      success: true,
      type: BiometricResultType.success,
      message: message,
    );
  }

  /// Resident dismissed or cancelled the biometric prompt.
  factory BiometricResult.cancelled([String message = 'Biometric verification cancelled by resident']) {
    return BiometricResult(
      success: false,
      type: BiometricResultType.cancelled,
      message: message,
    );
  }

  /// Resident's biometric sample did not match the enrolled profile.
  factory BiometricResult.failed([
    String message = 'Biometric identity could not be verified. Please try again.',
  ]) {
    return BiometricResult(
      success: false,
      type: BiometricResultType.failed,
      message: message,
    );
  }

  /// Hardware sensor is not present or not available.
  factory BiometricResult.notAvailable([
    String message = 'Biometric hardware sensor is unavailable on this device.',
  ]) {
    return BiometricResult(
      success: false,
      type: BiometricResultType.notAvailable,
      message: message,
    );
  }

  /// No biometrics are currently enrolled in the OS.
  factory BiometricResult.notEnrolled([
    String message = 'No biometrics enrolled. Please register your fingerprint or face in device settings.',
  ]) {
    return BiometricResult(
      success: false,
      type: BiometricResultType.notEnrolled,
      message: message,
    );
  }

  /// Biometric sensor is locked out due to excessive failed attempts.
  factory BiometricResult.lockedOut({required bool permanently}) {
    return BiometricResult(
      success: false,
      type: permanently
          ? BiometricResultType.lockedOutPermanently
          : BiometricResultType.lockedOutTemporarily,
      message: permanently
          ? 'Biometric sensor permanently locked due to too many failed attempts. Please unlock with your device PIN or password in device settings.'
          : 'Biometric sensor temporarily locked due to excessive failed attempts. Please wait 30 seconds before retrying.',
      errorCode: permanently ? 'PermanentlyLockedOut' : 'LockedOut',
    );
  }

  /// Other platform error.
  factory BiometricResult.error(String message, [String? code]) {
    return BiometricResult(
      success: false,
      type: BiometricResultType.otherError,
      message: message,
      errorCode: code,
    );
  }

  @override
  String toString() => 'BiometricResult(success: $success, type: $type, message: $message)';
}
