import 'package:flutter/material.dart';
import '../state/auth_notifier.dart';

class ActivateScreen extends StatefulWidget {
  final AuthNotifier authNotifier;
  final String? initialEmail;

  const ActivateScreen({
    super.key,
    required this.authNotifier,
    this.initialEmail,
  });

  @override
  State<ActivateScreen> createState() => _ActivateScreenState();
}

class _ActivateScreenState extends State<ActivateScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailController;
  final _tokenController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(text: widget.initialEmail ?? '');
  }

  @override
  void dispose() {
    _emailController.dispose();
    _tokenController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _handleActivation() async {
    if (!_formKey.currentState!.validate()) return;

    final message = await widget.authNotifier.activate(
      email: _emailController.text,
      activationToken: _tokenController.text,
      newPassword: _newPasswordController.text,
    );

    if (mounted) {
      if (message != null) {
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: const Text('Activation Successful!'),
            content: Text(message),
            actions: [
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(ctx); // Close dialog
                  Navigator.pop(context); // Go back to login
                },
                child: const Text('Proceed to Login'),
              ),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.authNotifier.errorMessage ?? 'Activation failed'),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Resident Activation'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Activate Your Resident Account',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Enter the activation token issued by your hostel warden along with your institutional email to configure your permanent password.',
                  style: TextStyle(color: Colors.grey.shade600),
                ),
                const SizedBox(height: 28),

                // Email
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Institutional Email',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.email_outlined),
                  ),
                  validator: (val) =>
                      val == null || !val.contains('@') ? 'Enter a valid email' : null,
                ),
                const SizedBox(height: 16),

                // Activation Token
                TextFormField(
                  controller: _tokenController,
                  decoration: const InputDecoration(
                    labelText: 'Activation Token',
                    hintText: 'e.g., ACTIVATE_CS2026_...',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.key_outlined),
                  ),
                  validator: (val) =>
                      val == null || val.trim().isEmpty ? 'Activation token is required' : null,
                ),
                const SizedBox(height: 16),

                // New Password
                TextFormField(
                  controller: _newPasswordController,
                  obscureText: _obscurePassword,
                  decoration: InputDecoration(
                    labelText: 'New Password',
                    border: const OutlineInputBorder(),
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      icon: Icon(_obscurePassword ? Icons.visibility_off : Icons.visibility),
                      onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                    ),
                  ),
                  validator: (val) =>
                      val == null || val.length < 8 ? 'Password must be >= 8 characters' : null,
                ),
                const SizedBox(height: 16),

                // Confirm Password
                TextFormField(
                  controller: _confirmPasswordController,
                  obscureText: _obscurePassword,
                  decoration: const InputDecoration(
                    labelText: 'Confirm Password',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.lock_outline),
                  ),
                  validator: (val) {
                    if (val != _newPasswordController.text) {
                      return 'Passwords do not match';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 28),

                ListenableBuilder(
                  listenable: widget.authNotifier,
                  builder: (context, _) {
                    final isLoading = widget.authNotifier.isLoading;
                    return ElevatedButton(
                      onPressed: isLoading ? null : _handleActivation,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: isLoading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text(
                              'Activate & Set Password',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
