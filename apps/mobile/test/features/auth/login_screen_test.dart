import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hostel_curfew_mobile/core/network/api_client.dart';
import 'package:hostel_curfew_mobile/core/storage/secure_storage_service.dart';
import 'package:hostel_curfew_mobile/features/auth/presentation/login_screen.dart';
import 'package:hostel_curfew_mobile/features/auth/services/auth_service.dart';
import 'package:hostel_curfew_mobile/features/auth/state/auth_notifier.dart';

void main() {
  group('LoginScreen Widget Tests', () {
    late InMemorySecureStorageService storage;
    late ApiClient apiClient;
    late AuthService authService;
    late AuthNotifier authNotifier;

    setUp(() {
      storage = InMemorySecureStorageService();
      apiClient = ApiClient(storage: storage);
      authService = AuthService(apiClient: apiClient, storage: storage);
      authNotifier = AuthNotifier(authService: authService);
    });

    testWidgets('should render login fields, sign in button, and activation link', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: LoginScreen(authNotifier: authNotifier),
        ),
      );

      // Verify header and UI elements
      expect(find.text('Hostel Curfew Portal'), findsOneWidget);
      expect(find.byKey(const Key('email_field')), findsOneWidget);
      expect(find.byKey(const Key('password_field')), findsOneWidget);
      expect(find.byKey(const Key('login_button')), findsOneWidget);
      expect(find.text('Activate Account'), findsOneWidget);
    });

    testWidgets('should display validation errors when fields are empty', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: LoginScreen(authNotifier: authNotifier),
        ),
      );

      // Tap Sign In without filling in form
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pumpAndSettle();

      expect(find.text('Email is required'), findsOneWidget);
      expect(find.text('Password is required'), findsOneWidget);
    });

    testWidgets('should validate email format and password minimum length', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: LoginScreen(authNotifier: authNotifier),
        ),
      );

      await tester.enterText(find.byKey(const Key('email_field')), 'invalid-email-format');
      await tester.enterText(find.byKey(const Key('password_field')), '123');

      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pumpAndSettle();

      expect(find.text('Enter a valid email address'), findsOneWidget);
      expect(find.text('Password must be at least 8 characters'), findsOneWidget);
    });
  });
}
