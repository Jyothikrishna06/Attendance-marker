import 'package:flutter/material.dart';
import 'core/constants/api_constants.dart';
import 'core/network/api_client.dart';
import 'core/storage/secure_storage_service.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/auth/services/auth_service.dart';
import 'features/auth/state/auth_notifier.dart';
import 'features/device/presentation/device_binding_screen.dart';
import 'features/device/services/device_service.dart';
import 'features/home/presentation/home_dashboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Core Services
  final storage = SecureStorageService();
  late final AuthNotifier authNotifier;

  final apiClient = ApiClient(
    storage: storage,
    baseUrl: ApiConstants.defaultBaseUrl,
    onSessionExpired: () {
      authNotifier.onSessionExpired();
    },
  );

  final authService = AuthService(apiClient: apiClient, storage: storage);
  final deviceService = DeviceService(apiClient: apiClient);
  authNotifier = AuthNotifier(authService: authService);

  // Check persisted session on boot
  await authNotifier.checkSession();

  runApp(HostelCurfewApp(
    authNotifier: authNotifier,
    apiClient: apiClient,
    deviceService: deviceService,
  ));
}

class HostelCurfewApp extends StatelessWidget {
  final AuthNotifier authNotifier;
  final ApiClient apiClient;
  final DeviceService deviceService;

  const HostelCurfewApp({
    super.key,
    required this.authNotifier,
    required this.apiClient,
    required this.deviceService,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Hostel Curfew Portal',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1E3A8A), // Campus Navy Blue
          brightness: Brightness.light,
        ),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1E3A8A),
          brightness: Brightness.dark,
        ),
      ),
      themeMode: ThemeMode.system,
      home: ListenableBuilder(
        listenable: authNotifier,
        builder: (context, _) {
          // 1. Initial boot / loading
          if (authNotifier.status == AuthStatus.initial) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          }

          // 2. Unauthenticated -> Show Login
          if (!authNotifier.isAuthenticated) {
            return LoginScreen(authNotifier: authNotifier);
          }

          final user = authNotifier.user;

          // 3. Authenticated but device not registered -> Force Device Registration
          if (user != null && !user.hasActiveDevice) {
            return DeviceBindingScreen(
              deviceService: deviceService,
              authNotifier: authNotifier,
            );
          }

          // 4. Authenticated with bound device -> Home Dashboard
          return HomeDashboardScreen(
            authNotifier: authNotifier,
            apiClient: apiClient,
          );
        },
      ),
    );
  }
}
