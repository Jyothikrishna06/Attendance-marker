import 'package:flutter_test/flutter_test.dart';
import 'package:hostel_curfew_mobile/core/biometrics/biometric_result.dart';
import 'package:hostel_curfew_mobile/core/biometrics/mock_biometric_service.dart';

void main() {
  group('Biometric Service & Result Unit Tests', () {
    late MockBiometricService mockBiometricService;

    setUp(() {
      mockBiometricService = MockBiometricService();
    });

    test('should succeed by default and record invocation metadata', () async {
      expect(await mockBiometricService.isBiometricAvailable(), true);
      expect(await mockBiometricService.hasEnrolledBiometrics(), true);
      expect(await mockBiometricService.getAvailableBiometricTypes(), contains('fingerprint'));

      final result = await mockBiometricService.authenticate(
        localizedReason: 'Test authentication',
        biometricOnly: true,
      );

      expect(result.success, true);
      expect(result.type, BiometricResultType.success);
      expect(mockBiometricService.authenticateCallCount, 1);
      expect(mockBiometricService.lastLocalizedReason, 'Test authentication');
      expect(mockBiometricService.lastBiometricOnly, true);
    });

    test('should return cancelled when resident dismisses biometric prompt', () async {
      mockBiometricService.setCancelled('User cancelled prompt');

      final result = await mockBiometricService.authenticate(
        localizedReason: 'Test cancellation',
      );

      expect(result.success, false);
      expect(result.type, BiometricResultType.cancelled);
      expect(result.message, 'User cancelled prompt');
    });

    test('should return failed when biometric sensor fails to match identity', () async {
      mockBiometricService.setFailed('Fingerprint mismatch');

      final result = await mockBiometricService.authenticate(
        localizedReason: 'Test mismatch',
      );

      expect(result.success, false);
      expect(result.type, BiometricResultType.failed);
      expect(result.message, 'Fingerprint mismatch');
    });

    test('should handle hardware unavailable scenario securely', () async {
      mockBiometricService.setUnavailable();

      expect(await mockBiometricService.isBiometricAvailable(), false);

      final result = await mockBiometricService.authenticate(
        localizedReason: 'Test unavailable',
      );

      expect(result.success, false);
      expect(result.type, BiometricResultType.notAvailable);
      expect(result.message, contains('unavailable'));
    });

    test('should handle biometrics not enrolled scenario', () async {
      mockBiometricService.setNotEnrolled();

      expect(await mockBiometricService.hasEnrolledBiometrics(), false);

      final result = await mockBiometricService.authenticate(
        localizedReason: 'Test not enrolled',
      );

      expect(result.success, false);
      expect(result.type, BiometricResultType.notEnrolled);
      expect(result.message, contains('No biometrics enrolled'));
    });

    test('should handle temporary lockout with retry guidance (30s delay)', () async {
      mockBiometricService.setLockedOut(permanently: false);

      final result = await mockBiometricService.authenticate(
        localizedReason: 'Test temporary lockout',
      );

      expect(result.success, false);
      expect(result.type, BiometricResultType.lockedOutTemporarily);
      expect(result.errorCode, 'LockedOut');
      expect(result.message, contains('temporarily locked'));
      expect(result.message, contains('30 seconds'));
    });

    test('should handle permanent lockout with PIN/password recovery guidance', () async {
      mockBiometricService.setLockedOut(permanently: true);

      final result = await mockBiometricService.authenticate(
        localizedReason: 'Test permanent lockout',
      );

      expect(result.success, false);
      expect(result.type, BiometricResultType.lockedOutPermanently);
      expect(result.errorCode, 'PermanentlyLockedOut');
      expect(result.message, contains('permanently locked'));
      expect(result.message, contains('PIN or password'));
    });

    test('should handle custom error codes and messages', () async {
      mockBiometricService.setError('Hardware bus error', 'HW_UNAVAILABLE_500');

      final result = await mockBiometricService.authenticate(
        localizedReason: 'Test custom error',
      );

      expect(result.success, false);
      expect(result.type, BiometricResultType.otherError);
      expect(result.errorCode, 'HW_UNAVAILABLE_500');
      expect(result.message, 'Hardware bus error');
    });
  });
}
