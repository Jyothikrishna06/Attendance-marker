import 'package:flutter/material.dart';
import '../../auth/state/auth_notifier.dart';

class ProfileScreen extends StatelessWidget {
  final AuthNotifier authNotifier;

  const ProfileScreen({super.key, required this.authNotifier});

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm Logout'),
        content: const Text('Are you sure you want to end your active session on this device?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              authNotifier.logout();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('Log Out', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = authNotifier.user;
    final profile = user?.residentProfile;
    final device = user?.activeDevice;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Resident Profile'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign Out',
            onPressed: () => _confirmLogout(context),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Avatar & Name Card
              Center(
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 40,
                      backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                      child: Text(
                        (user?.name.isNotEmpty == true) ? user!.name[0].toUpperCase() : 'S',
                        style: TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      user?.name ?? 'Resident',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    Text(
                      user?.email ?? '',
                      style: TextStyle(color: Colors.grey.shade600),
                    ),
                    const SizedBox(height: 6),
                    Chip(
                      label: Text(
                        'STATUS: ${user?.status ?? 'UNKNOWN'}',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                      backgroundColor: Colors.green.shade50,
                      side: BorderSide(color: Colors.green.shade200),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Academic & Hostel Assignment
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Hostel & Room Assignment', style: Theme.of(context).textTheme.titleMedium),
                      const Divider(),
                      _buildDetailRow(Icons.badge_outlined, 'Roll Number', profile?.rollNumber ?? 'Not assigned'),
                      _buildDetailRow(Icons.apartment_outlined, 'Hostel ID', profile?.hostelId ?? 'Not assigned'),
                      _buildDetailRow(Icons.meeting_room_outlined, 'Room ID', profile?.roomId ?? 'Not assigned'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Bound Hardware Device
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Bound Device', style: Theme.of(context).textTheme.titleMedium),
                          if (device != null)
                            Chip(
                              label: Text(
                                device.status,
                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                              ),
                              backgroundColor: device.isActive ? Colors.blue.shade50 : Colors.red.shade50,
                            ),
                        ],
                      ),
                      const Divider(),
                      if (device != null) ...[
                        _buildDetailRow(Icons.smartphone_outlined, 'Model', device.deviceModel),
                        _buildDetailRow(Icons.phonelink_setup, 'OS', '${device.osName ?? ''} ${device.osVersion ?? ''}'),
                        _buildDetailRow(Icons.fingerprint, 'Hardware Fingerprint', device.deviceIdentifier),
                      ] else ...[
                        const Text('No hardware device bound yet.', style: TextStyle(color: Colors.red)),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Sign Out Button
              OutlinedButton.icon(
                onPressed: () => _confirmLogout(context),
                icon: const Icon(Icons.logout, color: Colors.redAccent),
                label: const Text('Log Out of Device', style: TextStyle(color: Colors.redAccent)),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Colors.redAccent),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6.0),
      child: Row(
        children: [
          Icon(icon, size: 20, color: Colors.grey.shade600),
          const SizedBox(width: 12),
          Text(label, style: const TextStyle(color: Colors.grey)),
          const Spacer(),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
