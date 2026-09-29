import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/secure_storage_service.dart';
import '../models/user_model.dart';

class AuthService {
  final ApiClient _apiClient;
  final ISecureStorageService _storage;

  AuthService({
    required ApiClient apiClient,
    required ISecureStorageService storage,
  })  : _apiClient = apiClient,
        _storage = storage;

  /// Authenticates with backend and saves session credentials securely
  Future<AuthSession> login(String email, String password) async {
    final response = await _apiClient.post(
      ApiConstants.login,
      body: {
        'email': email.trim(),
        'password': password,
      },
      requiresAuth: false,
    );

    final data = response['data'] as Map<String, dynamic>;
    final session = AuthSession.fromJson(data);

    // Persist tokens and user profile in secure storage
    await _storage.setAccessToken(session.accessToken);
    await _storage.setRefreshToken(session.refreshToken);
    await _storage.setCachedUserJson(session.user.toJsonString());

    return session;
  }

  /// Activates a student account using an institution-issued activation token
  Future<String> activate({
    required String email,
    required String activationToken,
    required String newPassword,
  }) async {
    final response = await _apiClient.post(
      ApiConstants.activate,
      body: {
        'email': email.trim(),
        'activationToken': activationToken.trim(),
        'newPassword': newPassword,
      },
      requiresAuth: false,
    );

    final data = response['data'] as Map<String, dynamic>?;
    return data?['message'] ?? 'Account successfully activated.';
  }

  /// Logs out of backend session and removes stored authentication tokens
  Future<void> logout() async {
    try {
      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken != null && refreshToken.isNotEmpty) {
        await _apiClient.post(
          ApiConstants.logout,
          body: {'refreshToken': refreshToken},
          requiresAuth: false,
        );
      }
    } catch (_) {
      // Proceed to clear local storage even if remote logout fails
    } finally {
      await _storage.clearAll();
    }
  }

  /// Checks if a valid authenticated session exists on app boot
  Future<User?> restoreSession() async {
    final token = await _storage.getAccessToken();
    if (token == null || token.isEmpty) {
      return null;
    }

    final userJson = await _storage.getCachedUserJson();
    if (userJson != null && userJson.isNotEmpty) {
      try {
        return User.fromJsonString(userJson);
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}
