import 'package:flutter/foundation.dart';
import '../../../core/network/api_exceptions.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';

enum AuthStatus {
  initial,
  loading,
  authenticated,
  unauthenticated,
  error,
}

class AuthNotifier extends ChangeNotifier {
  final AuthService _authService;

  AuthStatus _status = AuthStatus.initial;
  User? _user;
  String? _errorMessage;
  String? _errorCode;

  AuthNotifier({required AuthService authService}) : _authService = authService;

  AuthStatus get status => _status;
  User? get user => _user;
  String? get errorMessage => _errorMessage;
  String? get errorCode => _errorCode;
  bool get isAuthenticated => _status == AuthStatus.authenticated && _user != null;
  bool get isLoading => _status == AuthStatus.loading;

  /// Check stored session on startup
  Future<void> checkSession() async {
    _status = AuthStatus.loading;
    notifyListeners();

    try {
      final restoredUser = await _authService.restoreSession();
      if (restoredUser != null) {
        _user = restoredUser;
        _status = AuthStatus.authenticated;
      } else {
        _status = AuthStatus.unauthenticated;
      }
    } catch (_) {
      _status = AuthStatus.unauthenticated;
    } finally {
      notifyListeners();
    }
  }

  /// Perform login with resident credentials
  Future<bool> login(String email, String password) async {
    _status = AuthStatus.loading;
    _errorMessage = null;
    _errorCode = null;
    notifyListeners();

    try {
      final session = await _authService.login(email, password);
      _user = session.user;
      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } on RateLimitException catch (e) {
      _status = AuthStatus.error;
      _errorCode = e.code;
      _errorMessage = 'Rate limit exceeded. Please retry in ${e.retryAfterSeconds ?? 60} seconds.';
      notifyListeners();
      return false;
    } on ApiException catch (e) {
      _status = AuthStatus.error;
      _errorCode = e.code;
      _errorMessage = e.message;
      notifyListeners();
      return false;
    } catch (e) {
      _status = AuthStatus.error;
      _errorCode = 'UNKNOWN';
      _errorMessage = 'An unexpected error occurred: ${e.toString()}';
      notifyListeners();
      return false;
    }
  }

  /// Perform account activation
  Future<String?> activate({
    required String email,
    required String activationToken,
    required String newPassword,
  }) async {
    _status = AuthStatus.loading;
    _errorMessage = null;
    _errorCode = null;
    notifyListeners();

    try {
      final message = await _authService.activate(
        email: email,
        activationToken: activationToken,
        newPassword: newPassword,
      );
      _status = AuthStatus.unauthenticated;
      notifyListeners();
      return message;
    } on ApiException catch (e) {
      _status = AuthStatus.error;
      _errorCode = e.code;
      _errorMessage = e.message;
      notifyListeners();
      return null;
    } catch (e) {
      _status = AuthStatus.error;
      _errorCode = 'UNKNOWN';
      _errorMessage = e.toString();
      notifyListeners();
      return null;
    }
  }

  /// Logs out the user and clears state
  Future<void> logout() async {
    _status = AuthStatus.loading;
    notifyListeners();

    await _authService.logout();
    _user = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  /// Updates user profile in memory and storage (e.g. after registering a device)
  void updateUser(User updatedUser) {
    _user = updatedUser;
    notifyListeners();
  }

  /// Called when refresh token expires or is rejected
  void onSessionExpired() {
    _user = null;
    _status = AuthStatus.unauthenticated;
    _errorMessage = 'Session expired. Please log in again.';
    notifyListeners();
  }
}
