import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/api_constants.dart';

abstract class ISecureStorageService {
  Future<String?> getAccessToken();
  Future<void> setAccessToken(String token);
  Future<String?> getRefreshToken();
  Future<void> setRefreshToken(String token);
  Future<String?> getCachedUserJson();
  Future<void> setCachedUserJson(String json);
  Future<void> clearAll();
}

/// Production implementation using FlutterSecureStorage (Keychain on iOS, Keystore on Android).
class SecureStorageService implements ISecureStorageService {
  final FlutterSecureStorage _storage;

  SecureStorageService({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  @override
  Future<String?> getAccessToken() => _storage.read(key: ApiConstants.keyAccessToken);

  @override
  Future<void> setAccessToken(String token) =>
      _storage.write(key: ApiConstants.keyAccessToken, value: token);

  @override
  Future<String?> getRefreshToken() => _storage.read(key: ApiConstants.keyRefreshToken);

  @override
  Future<void> setRefreshToken(String token) =>
      _storage.write(key: ApiConstants.keyRefreshToken, value: token);

  @override
  Future<String?> getCachedUserJson() => _storage.read(key: ApiConstants.keyCachedUser);

  @override
  Future<void> setCachedUserJson(String json) =>
      _storage.write(key: ApiConstants.keyCachedUser, value: json);

  @override
  Future<void> clearAll() => _storage.deleteAll();
}

/// In-memory implementation for automated unit testing and mock verification.
class InMemorySecureStorageService implements ISecureStorageService {
  final Map<String, String> _data = {};

  @override
  Future<String?> getAccessToken() async => _data[ApiConstants.keyAccessToken];

  @override
  Future<void> setAccessToken(String token) async =>
      _data[ApiConstants.keyAccessToken] = token;

  @override
  Future<String?> getRefreshToken() async => _data[ApiConstants.keyRefreshToken];

  @override
  Future<void> setRefreshToken(String token) async =>
      _data[ApiConstants.keyRefreshToken] = token;

  @override
  Future<String?> getCachedUserJson() async => _data[ApiConstants.keyCachedUser];

  @override
  Future<void> setCachedUserJson(String json) async =>
      _data[ApiConstants.keyCachedUser] = json;

  @override
  Future<void> clearAll() async => _data.clear();
}
