class ApiException implements Exception {
  final String message;
  final int statusCode;
  final String code;
  final dynamic details;

  const ApiException({
    required this.message,
    required this.statusCode,
    this.code = 'UNKNOWN_ERROR',
    this.details,
  });

  @override
  String toString() => 'ApiException [$code] ($statusCode): $message';
}

class UnauthorizedException extends ApiException {
  const UnauthorizedException({
    String message = 'Session expired or unauthorized',
    String code = 'UNAUTHORIZED',
  }) : super(message: message, statusCode: 401, code: code);
}

class ForbiddenException extends ApiException {
  const ForbiddenException({
    String message = 'Access forbidden for this account',
    String code = 'FORBIDDEN',
  }) : super(message: message, statusCode: 403, code: code);
}

class NotFoundException extends ApiException {
  const NotFoundException({
    String message = 'Resource not found',
    String code = 'NOT_FOUND',
  }) : super(message: message, statusCode: 404, code: code);
}

class ConflictException extends ApiException {
  const ConflictException({
    String message = 'Resource conflict or duplicate registration',
    String code = 'CONFLICT',
  }) : super(message: message, statusCode: 409, code: code);
}

class RateLimitException extends ApiException {
  final int? retryAfterSeconds;

  const RateLimitException({
    String message = 'Too many requests. Please wait before retrying.',
    this.retryAfterSeconds,
  }) : super(message: message, statusCode: 429, code: 'RATE_LIMIT_EXCEEDED');
}

class OfflineException extends ApiException {
  const OfflineException({
    String message = 'No internet connection. Please verify your network.',
  }) : super(message: message, statusCode: 0, code: 'NETWORK_OFFLINE');
}

class ServerException extends ApiException {
  const ServerException({
    String message = 'An unexpected server error occurred',
  }) : super(message: message, statusCode: 500, code: 'INTERNAL_SERVER_ERROR');
}
