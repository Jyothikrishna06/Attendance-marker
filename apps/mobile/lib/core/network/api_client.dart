import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';
import 'api_exceptions.dart';

typedef SessionExpiredCallback = void Function();

class ApiClient {
  final http.Client _httpClient;
  final ISecureStorageService _storage;
  final String baseUrl;
  final SessionExpiredCallback? onSessionExpired;

  bool _isRefreshing = false;

  ApiClient({
    http.Client? httpClient,
    required ISecureStorageService storage,
    String? baseUrl,
    this.onSessionExpired,
  })  : _httpClient = httpClient ?? http.Client(),
        _storage = storage,
        baseUrl = baseUrl ?? ApiConstants.defaultBaseUrl;

  Future<dynamic> get(
    String endpoint, {
    Map<String, String>? headers,
    bool requiresAuth = true,
  }) async {
    return _sendWithRetry(
      () => _buildRequest('GET', endpoint, headers: headers, requiresAuth: requiresAuth),
      requiresAuth: requiresAuth,
    );
  }

  Future<dynamic> post(
    String endpoint, {
    dynamic body,
    Map<String, String>? headers,
    bool requiresAuth = true,
  }) async {
    return _sendWithRetry(
      () => _buildRequest('POST', endpoint, body: body, headers: headers, requiresAuth: requiresAuth),
      requiresAuth: requiresAuth,
    );
  }

  Future<dynamic> put(
    String endpoint, {
    dynamic body,
    Map<String, String>? headers,
    bool requiresAuth = true,
  }) async {
    return _sendWithRetry(
      () => _buildRequest('PUT', endpoint, body: body, headers: headers, requiresAuth: requiresAuth),
      requiresAuth: requiresAuth,
    );
  }

  Future<dynamic> delete(
    String endpoint, {
    Map<String, String>? headers,
    bool requiresAuth = true,
  }) async {
    return _sendWithRetry(
      () => _buildRequest('DELETE', endpoint, headers: headers, requiresAuth: requiresAuth),
      requiresAuth: requiresAuth,
    );
  }

  Future<http.Request> _buildRequest(
    String method,
    String endpoint, {
    dynamic body,
    Map<String, String>? headers,
    bool requiresAuth = true,
  }) async {
    final uri = Uri.parse('$baseUrl$endpoint');
    final request = http.Request(method, uri);

    request.headers['Content-Type'] = 'application/json';
    request.headers['Accept'] = 'application/json';

    if (headers != null) {
      request.headers.addAll(headers);
    }

    if (requiresAuth) {
      final token = await _storage.getAccessToken();
      if (token != null && token.isNotEmpty) {
        request.headers['Authorization'] = 'Bearer $token';
      }
    }

    if (body != null) {
      request.body = jsonEncode(body);
    }

    return request;
  }

  Future<dynamic> _sendWithRetry(
    Future<http.Request> Function() requestBuilder, {
    bool requiresAuth = true,
  }) async {
    try {
      final request = await requestBuilder();
      final streamedResponse = await _httpClient.send(request);
      final response = await http.Response.fromStream(streamedResponse);

      // Handle 401 Unauthorized with token refresh if auth was required
      if (response.statusCode == 401 && requiresAuth) {
        final refreshSucceeded = await _attemptTokenRefresh();
        if (refreshSucceeded) {
          // Re-build request with updated access token and retry
          final retryRequest = await requestBuilder();
          final retryStreamed = await _httpClient.send(retryRequest);
          final retryResponse = await http.Response.fromStream(retryStreamed);
          return _processResponse(retryResponse);
        } else {
          await _storage.clearAll();
          onSessionExpired?.call();
          throw const UnauthorizedException(
            message: 'Your session has expired. Please log in again.',
            code: 'SESSION_EXPIRED',
          );
        }
      }

      return _processResponse(response);
    } on SocketException {
      throw const OfflineException();
    } on http.ClientException {
      throw const OfflineException();
    }
  }

  Future<bool> _attemptTokenRefresh() async {
    if (_isRefreshing) return false;
    _isRefreshing = true;

    try {
      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken == null || refreshToken.isEmpty) {
        return false;
      }

      final uri = Uri.parse('$baseUrl${ApiConstants.refresh}');
      final response = await _httpClient.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      );

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body);
        final data = json['data'];
        final newAccessToken = data['accessToken'] as String?;
        final newRefreshToken = data['refreshToken'] as String?;

        if (newAccessToken != null && newRefreshToken != null) {
          await _storage.setAccessToken(newAccessToken);
          await _storage.setRefreshToken(newRefreshToken);
          return true;
        }
      }
      return false;
    } catch (_) {
      return false;
    } finally {
      _isRefreshing = false;
    }
  }

  dynamic _processResponse(http.Response response) {
    dynamic jsonBody;
    try {
      if (response.body.isNotEmpty) {
        jsonBody = jsonDecode(response.body);
      }
    } catch (_) {
      // Body not JSON
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonBody;
    }

    // Extract standardized RFC 7807 problem details
    String errorCode = 'HTTP_${response.statusCode}';
    String errorMessage = 'Request failed with status ${response.statusCode}';
    dynamic errorDetails;

    if (jsonBody is Map<String, dynamic> && jsonBody.containsKey('error')) {
      final errorMap = jsonBody['error'];
      if (errorMap is Map<String, dynamic>) {
        errorCode = errorMap['code'] ?? errorCode;
        errorMessage = errorMap['message'] ?? errorMessage;
        errorDetails = errorMap['details'];
      }
    }

    switch (response.statusCode) {
      case 400:
        throw ApiException(
          message: errorMessage,
          statusCode: 400,
          code: errorCode,
          details: errorDetails,
        );
      case 401:
        throw UnauthorizedException(message: errorMessage, code: errorCode);
      case 403:
        throw ForbiddenException(message: errorMessage, code: errorCode);
      case 404:
        throw NotFoundException(message: errorMessage, code: errorCode);
      case 409:
        throw ConflictException(message: errorMessage, code: errorCode);
      case 429:
        int? retryAfter;
        final header = response.headers['retry-after'];
        if (header != null) {
          retryAfter = int.tryParse(header);
        }
        throw RateLimitException(message: errorMessage, retryAfterSeconds: retryAfter);
      default:
        if (response.statusCode >= 500) {
          throw ServerException(message: errorMessage);
        }
        throw ApiException(message: errorMessage, statusCode: response.statusCode, code: errorCode);
    }
  }
}
