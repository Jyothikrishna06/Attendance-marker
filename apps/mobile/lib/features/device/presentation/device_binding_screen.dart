import 'package:flutter/material.dart';
import '../../auth/models/user_model.dart';
import '../../auth/state/auth_notifier.dart';
import '../services/device_service.dart';

class DeviceBindingScreen extends StatefulWidget {
  final DeviceService deviceService;
  final AuthNotifier authNotifier;

  const DeviceBindingScreen({
    super.key,
    required this.deviceService,
    required this.authNotifier,
  });

  @override
  State<DeviceBindingScreen> createState() => _DeviceBindingScreenState();
}

class _DeviceBindingScreenState extends State<DeviceBindingScreen> {
  Map<String, String>? _deviceInfo;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _fetchDeviceInfo();
  }

  Future<void> _fetchDeviceInfo() async {
    final info = await widget.deviceService.getDeviceInfo();
    if (mounted) {
      setState(() {
        _deviceInfo = info;
      });
    }
  }

  Future<void> _registerDevice() async {
    if (_deviceInfo == null) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final device = await widget.deviceService.registerDevice(
        deviceIdentifier: _deviceInfo!['deviceIdentifier']!,
        deviceModel: _deviceInfo!['deviceModel']!,
        osName: _deviceInfo!['osName']!,
        osVersion: _deviceInfo!['osVersion']!,
      );

      // Update current user state with active registered device
      final currentUser = widget.authNotifier.user;
      if (currentUser != null) {
        final updatedUser = User(
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          role: currentUser.role,
          status: currentUser.status,
          residentProfile: currentUser.residentProfile,
          activeDevice: device,
        );
        widget.authNotifier.updateUser(updatedUser);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.authNotifier.user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Device Binding Required'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: () => widget.authNotifier.logout(),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Security info banner
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.amber.shade300),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.security, color: Colors.amber.shade900, size: 28),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'One-Student, One-Device Policy',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.amber.shade900,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'To prevent proxy check-ins, curfew verification must be performed from a registered device. '
                            'Only one active device can be bound to your account at a time.',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.amber.shade900,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Resident details card
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Resident Account', style: Theme.of(context).textTheme.titleMedium),
                      const Divider(),
                      _buildInfoRow('Name', user?.name ?? 'Unknown'),
                      _buildInfoRow('Roll Number', user?.residentProfile?.rollNumber ?? 'N/A'),
                      _buildInfoRow('Email', user?.email ?? 'N/A'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Hardware details card
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Detected Hardware', style: Theme.of(context).textTheme.titleMedium),
                      const Divider(),
                      if (_deviceInfo == null)
                        const Center(child: CircularProgressIndicator())
                      else ...[
                        _buildInfoRow('Model', _deviceInfo!['deviceModel'] ?? 'Unknown'),
                        _buildInfoRow('OS', '${_deviceInfo!['osName']} ${_deviceInfo!['osVersion']}'),
                        _buildInfoRow('Hardware ID', _deviceInfo!['deviceIdentifier'] ?? 'Unknown'),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              if (_errorMessage != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16.0),
                  child: Text(
                    _errorMessage!,
                    style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
                    textAlign: TextAlign.center,
                  ),
                ),

              ElevatedButton.icon(
                onPressed: (_isLoading || _deviceInfo == null) ? null : _registerDevice,
                icon: _isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.phonelink_lock),
                label: Text(
                  _isLoading ? 'Registering...' : 'Register This Device',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.grey)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
