import '../../../core/biometrics/biometric_result.dart';

/// Status outcomes of the resident multi-factor presence verification sequence.
enum PresenceFlowStatus {
  /// Verified inside hostel with server timestamp.
  verified,

  /// Resident cancelled or failed device biometric check before submission.
  biometricAborted,

  /// Rejected by backend because device is not on authorized hostel network (HTTP 403).
  networkUnauthorized,

  /// Server rejected challenge (e.g. timeout, duplicate active entry, invalid nonce).
  serverRejected,

  /// Device is offline or server unreachable.
  offline,
}

/// Result of a multi-factor presence verification attempt.
class PresenceVerificationResult {
  final PresenceFlowStatus status;
  final bool isSuccess;
  final String message;
  final String? eventId;
  final String? serverTimestamp;
  final String? curfewDate;
  final BiometricResult? biometricResult;
  final Map<String, dynamic>? rawData;

  const PresenceVerificationResult({
    required this.status,
    required this.isSuccess,
    required this.message,
    this.eventId,
    this.serverTimestamp,
    this.curfewDate,
    this.biometricResult,
    this.rawData,
  });

  factory PresenceVerificationResult.verified(Map<String, dynamic> data) {
    return PresenceVerificationResult(
      status: PresenceFlowStatus.verified,
      isSuccess: true,
      message: 'Presence verified successfully: Inside Hostel',
      eventId: data['eventId'] as String?,
      serverTimestamp: data['serverTimestamp'] as String?,
      curfewDate: data['curfewDate'] as String?,
      rawData: data,
    );
  }

  factory PresenceVerificationResult.biometricAborted(BiometricResult bio) {
    return PresenceVerificationResult(
      status: PresenceFlowStatus.biometricAborted,
      isSuccess: false,
      message: bio.message,
      biometricResult: bio,
    );
  }

  factory PresenceVerificationResult.networkUnauthorized(String message) {
    return PresenceVerificationResult(
      status: PresenceFlowStatus.networkUnauthorized,
      isSuccess: false,
      message: message,
    );
  }

  factory PresenceVerificationResult.failure(
    String message, [
    PresenceFlowStatus status = PresenceFlowStatus.serverRejected,
  ]) {
    return PresenceVerificationResult(
      status: status,
      isSuccess: false,
      message: message,
    );
  }
}
