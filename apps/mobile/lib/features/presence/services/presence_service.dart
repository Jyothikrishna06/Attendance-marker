import '../../../core/biometrics/biometric_result.dart';
import '../../../core/biometrics/biometric_service.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exceptions.dart';
import '../models/presence_model.dart';

/// Service responsible for managing resident curfew presence entry, exit, and status.
/// Coordinates the backend cryptographic challenge and native OS biometric confirmation.
class PresenceService {
  final ApiClient apiClient;
  final IBiometricService biometricService;

  PresenceService({
    required this.apiClient,
    required this.biometricService,
  });

  /// Executes the 3-step presence entry sequence:
  /// 1. Request a short-lived anti-replay challenge session from the backend (`POST /presence/entry/start`).
  /// 2. Prompt native OS biometric verification (`BiometricPrompt` / `LAContext`).
  /// 3. If biometrics succeed, submit proof to the backend (`POST /presence/entry/verify`).
  ///
  /// **Security Guarantee**:
  /// If biometric authentication fails or is cancelled, step 3 is NEVER executed,
  /// preventing unauthorized verification attempts from reaching the server.
  Future<PresenceVerificationResult> verifyEntryFlow({
    String? clientSsid,
    Map<String, dynamic>? extraMetadata,
  }) async {
    try {
      // Step 1: Request Challenge from Server
      final startRes = await apiClient.post(
        ApiConstants.presenceEntryStart,
        body: {
          if (extraMetadata != null) 'clientMetadata': extraMetadata,
        },
      );

      final sessionData = startRes['data'] as Map<String, dynamic>;
      final sessionId = sessionData['sessionId'] as String;
      final challengeNonce = sessionData['challengeNonce'] as String;

      // Step 2: Native OS Biometric Attestation Callback
      final bioResult = await biometricService.authenticate(
        localizedReason: 'Scan your fingerprint or face to verify your presence for curfew check-in',
        biometricOnly: true,
      );

      if (!bioResult.success) {
        // Biometrics aborted: cancel flow without calling /presence/entry/verify
        return PresenceVerificationResult.biometricAborted(bioResult);
      }

      // Step 3: Submit Verification Evidence to Server
      final networkMetadata = <String, dynamic>{
        if (clientSsid != null) 'clientSsid': clientSsid,
      };

      final verifyRes = await apiClient.post(
        ApiConstants.presenceEntryVerify,
        body: {
          'sessionId': sessionId,
          'challengeNonce': challengeNonce,
          'biometricConfirmed': true,
          if (networkMetadata.isNotEmpty) 'networkMetadata': networkMetadata,
        },
      );

      return PresenceVerificationResult.verified(
        verifyRes['data'] as Map<String, dynamic>,
      );
    } on ForbiddenException catch (e) {
      if (e.code == 'NETWORK_NOT_AUTHORIZED') {
        return PresenceVerificationResult.networkUnauthorized(
          'Network verification failed: You are not connected to the authorized hostel Wi-Fi network.',
        );
      }
      return PresenceVerificationResult.failure(e.message, PresenceFlowStatus.serverRejected);
    } on ConflictException catch (e) {
      return PresenceVerificationResult.failure(
        e.message,
        PresenceFlowStatus.serverRejected,
      );
    } on OfflineException catch (e) {
      return PresenceVerificationResult.failure(e.message, PresenceFlowStatus.offline);
    } on ApiException catch (e) {
      return PresenceVerificationResult.failure(e.message, PresenceFlowStatus.serverRejected);
    } catch (e) {
      return PresenceVerificationResult.failure('An unexpected error occurred: $e');
    }
  }

  /// Records an authoritative hostel exit event.
  Future<Map<String, dynamic>> recordExit({String? reason}) async {
    final res = await apiClient.post(
      ApiConstants.presenceExit,
      body: {
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
    );
    return res['data'] as Map<String, dynamic>;
  }

  /// Fetches latest presence status and recent events for the authenticated resident.
  Future<Map<String, dynamic>> getMyPresence() async {
    final res = await apiClient.get(ApiConstants.presenceStatus);
    return res['data'] as Map<String, dynamic>;
  }
}
