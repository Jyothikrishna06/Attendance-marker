import 'package:flutter/material.dart';
import '../../../core/network/api_client.dart';
import '../../auth/state/auth_notifier.dart';
import '../../profile/presentation/profile_screen.dart';

class HomeDashboardScreen extends StatefulWidget {
  final AuthNotifier authNotifier;
  final ApiClient apiClient;

  const HomeDashboardScreen({
    super.key,
    required this.authNotifier,
    required this.apiClient,
  });

  @override
  State<HomeDashboardScreen> createState() => _HomeDashboardScreenState();
}

class _HomeDashboardScreenState extends State<HomeDashboardScreen> {
  bool _isLoading = false;
  bool _isOffline = false;
  String _curfewStatus = 'PENDING_VERIFICATION';
  String _curfewTime = '21:30';
  String? _lastVerificationTime;

  @override
  void initState() {
    super.initState();
    _fetchCurfewStatus();
  }

  Future<void> _fetchCurfewStatus() async {
    setState(() {
      _isLoading = true;
      _isOffline = false;
    });

    try {
      // Connect to resident home endpoint
      final response = await widget.apiClient.get('/resident/home');
      if (mounted && response != null) {
        setState(() {
          _curfewStatus = 'VERIFIED_INSIDE';
          _lastVerificationTime = 'Today, 20:15';
        });
      }
    } catch (e) {
      if (mounted) {
        if (e.toString().contains('OFFLINE') || e.toString().contains('SocketException')) {
          setState(() => _isOffline = true);
        }
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.authNotifier.user;
    final device = user?.activeDevice;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Hostel Curfew Portal'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline),
            tooltip: 'My Profile',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ProfileScreen(authNotifier: widget.authNotifier),
                ),
              );
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchCurfewStatus,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Offline Banner
              if (_isOffline)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.shade100,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.shade300),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.wifi_off, color: Colors.red.shade800),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'You are currently offline. Verification requires internet connectivity.',
                          style: TextStyle(color: Colors.red.shade900, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),

              // Greeting Header
              Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                    child: Text(
                      (user?.name.isNotEmpty == true) ? user!.name[0].toUpperCase() : 'S',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Welcome back,',
                        style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                      ),
                      Text(
                        user?.name ?? 'Resident Student',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Primary Curfew Status Card
              Card(
                elevation: 3,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                color: _getStatusColor(_curfewStatus).withOpacity(0.08),
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Tonight\'s Curfew Status',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: _getStatusColor(_curfewStatus),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              _curfewStatus.replaceAll('_', ' '),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _buildStatItem('Curfew Time', _curfewTime),
                          _buildStatItem('Grace Window', '15 mins'),
                          _buildStatItem('Last Check', _lastVerificationTime ?? 'None'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Active Device Info Strip
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.blue.shade200),
                ),
                child: Row(
                  children: [
                    Icon(Icons.smartphone, color: Colors.blue.shade700),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            device?.deviceModel ?? 'Bound Device',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                          ),
                          Text(
                            'Hardware Fingerprint Verified',
                            style: TextStyle(color: Colors.blue.shade900, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.check_circle, color: Colors.blue.shade700, size: 20),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Action Buttons
              ElevatedButton.icon(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Starting presence verification challenge sequence...'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
                icon: const Icon(Icons.fingerprint),
                label: const Text(
                  'Verify Presence Now',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  backgroundColor: Theme.of(context).colorScheme.primary,
                  foregroundColor: Colors.white,
                ),
              ),
              const SizedBox(height: 12),

              OutlinedButton.icon(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Opening outpass and leave request form...'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
                icon: const Icon(Icons.time_to_leave_outlined),
                label: const Text('Apply for Outpass / Leave'),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'VERIFIED_INSIDE':
        return Colors.green.shade700;
      case 'APPROVED_LEAVE':
        return Colors.blue.shade700;
      case 'PENDING_VERIFICATION':
        return Colors.amber.shade800;
      case 'VERIFICATION_FAILED':
        return Colors.red.shade700;
      default:
        return Colors.grey.shade700;
    }
  }

  Widget _buildStatItem(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
      ],
    );
  }
}
