import 'package:flutter/material.dart';
import '../../../core/biometrics/biometric_result.dart';
import '../../../core/biometrics/biometric_service.dart';
import '../../../core/network/api_client.dart';
import '../../auth/state/auth_notifier.dart';
import '../../presence/models/presence_model.dart';
import '../../presence/services/presence_service.dart';
import '../../profile/presentation/profile_screen.dart';

class HomeDashboardScreen extends StatefulWidget {
  final AuthNotifier authNotifier;
  final ApiClient apiClient;
  final PresenceService? presenceService;
  final IBiometricService? biometricService;

  const HomeDashboardScreen({
    super.key,
    required this.authNotifier,
    required this.apiClient,
    this.presenceService,
    this.biometricService,
  });

  @override
  State<HomeDashboardScreen> createState() => _HomeDashboardScreenState();
}

class _HomeDashboardScreenState extends State<HomeDashboardScreen> {
  late final PresenceService _presenceService;
  bool _isLoading = false;
  bool _isOffline = false;
  String _curfewStatus = 'PENDING_VERIFICATION';
  final String _curfewTime = '21:30';
  String? _lastVerificationTime;

  @override
  void initState() {
    super.initState();
    _presenceService = widget.presenceService ??
        PresenceService(
          apiClient: widget.apiClient,
          biometricService: widget.biometricService ?? LocalAuthBiometricService(),
        );
    _fetchCurfewStatus();
  }

  Future<void> _fetchCurfewStatus() async {
    setState(() {
      _isLoading = true;
      _isOffline = false;
    });

    try {
      final data = await _presenceService.getMyPresence();
      if (mounted) {
        setState(() {
          final serverStatus = data['currentStatus'] as String? ?? 'PENDING_VERIFICATION';
          _curfewStatus = serverStatus;
          if (data['lastEventTimestamp'] != null) {
            final dt = DateTime.parse(data['lastEventTimestamp'] as String).toLocal();
            _lastVerificationTime =
                'Today, ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
          }
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

  Future<void> _onVerifyPresencePressed() async {
    if (_isLoading) return;

    setState(() {
      _isLoading = true;
      _isOffline = false;
    });

    try {
      final result = await _presenceService.verifyEntryFlow();

      if (!mounted) return;

      switch (result.status) {
        case PresenceFlowStatus.verified:
          final now = TimeOfDay.now();
          final formattedTime =
              'Today, ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
          setState(() {
            _curfewStatus = 'VERIFIED_INSIDE';
            _lastVerificationTime = formattedTime;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Row(
                children: const [
                  Icon(Icons.check_circle, color: Colors.white),
                  SizedBox(width: 10),
                  Text('Presence verified successfully: Inside Hostel'),
                ],
              ),
              backgroundColor: Colors.green.shade700,
              behavior: SnackBarBehavior.floating,
            ),
          );
          break;

        case PresenceFlowStatus.biometricAborted:
          final bio = result.biometricResult;
          if (bio == null) break;

          if (bio.type == BiometricResultType.cancelled) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Biometric verification cancelled by resident.'),
                behavior: SnackBarBehavior.floating,
              ),
            );
          } else if (bio.type == BiometricResultType.lockedOutTemporarily ||
              bio.type == BiometricResultType.lockedOutPermanently) {
            _showSecurityDialog(
              title: 'Biometric Sensor Locked Out',
              content: bio.message,
              icon: Icons.lock_clock,
              color: Colors.red.shade700,
            );
          } else if (bio.type == BiometricResultType.notAvailable ||
              bio.type == BiometricResultType.notEnrolled) {
            _showSecurityDialog(
              title: 'Biometric Setup Required',
              content: bio.message,
              icon: Icons.fingerprint,
              color: Colors.amber.shade800,
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(bio.message),
                backgroundColor: Colors.red.shade700,
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
          break;

        case PresenceFlowStatus.networkUnauthorized:
          _showSecurityDialog(
            title: 'Hostel Wi-Fi Required',
            content: result.message,
            icon: Icons.wifi_password,
            color: Colors.red.shade700,
          );
          break;

        case PresenceFlowStatus.offline:
          setState(() => _isOffline = true);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(result.message),
              backgroundColor: Colors.red.shade700,
              behavior: SnackBarBehavior.floating,
            ),
          );
          break;

        case PresenceFlowStatus.serverRejected:
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(result.message),
              backgroundColor: Colors.red.shade700,
              behavior: SnackBarBehavior.floating,
            ),
          );
          break;
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _onRecordExitPressed() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Record Hostel Departure'),
        content: const Text(
          'Are you leaving the hostel premises? This will update your presence status to Outside Hostel.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.amber.shade800),
            child: const Text('Confirm Departure', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirm != true || !mounted) return;

    setState(() => _isLoading = true);
    try {
      await _presenceService.recordExit(reason: 'Resident departing hostel');
      if (mounted) {
        setState(() {
          _curfewStatus = 'VERIFIED_OUTSIDE';
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Hostel departure recorded: Status is Outside Hostel'),
            backgroundColor: Colors.blue.shade700,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to record exit: $e'),
            backgroundColor: Colors.red.shade700,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _showSecurityDialog({
    required String title,
    required String content,
    required IconData icon,
    required Color color,
  }) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: Icon(icon, color: color, size: 40),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        content: Text(content),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Dismiss'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.authNotifier.user;
    final device = user?.activeDevice;
    final isInside = _curfewStatus == 'VERIFIED_INSIDE';

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
                          'You are currently offline. Verification requires connection to hostel network.',
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
              if (!isInside)
                ElevatedButton.icon(
                  onPressed: _isLoading ? null : _onVerifyPresencePressed,
                  icon: _isLoading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.fingerprint),
                  label: Text(
                    _isLoading ? 'Verifying Presence...' : 'Verify Presence Now',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    backgroundColor: Theme.of(context).colorScheme.primary,
                    foregroundColor: Colors.white,
                  ),
                )
              else
                OutlinedButton.icon(
                  onPressed: _isLoading ? null : _onRecordExitPressed,
                  icon: _isLoading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.logout),
                  label: const Text(
                    'Record Hostel Departure (Exit)',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                  ),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    foregroundColor: Colors.amber.shade900,
                    side: BorderSide(color: Colors.amber.shade800),
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
      case 'VERIFIED_OUTSIDE':
        return Colors.blue.shade700;
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
