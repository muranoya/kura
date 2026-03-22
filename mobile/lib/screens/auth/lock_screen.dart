import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/vault_provider.dart';
import '../../services/biometrics_service.dart';
import '../../widgets/common/secret_field.dart';

class LockScreen extends ConsumerStatefulWidget {
  const LockScreen({Key? key}) : super(key: key);

  @override
  ConsumerState<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends ConsumerState<LockScreen> {
  late TextEditingController _passwordController;
  bool _isUnlocking = false;
  bool _showPassword = false;
  final _biometricsService = BiometricsService();
  bool _biometricsAvailable = false;

  @override
  void initState() {
    super.initState();
    _passwordController = TextEditingController();
    _checkBiometrics();
  }

  Future<void> _checkBiometrics() async {
    final available = await _biometricsService.isAvailable();
    setState(() {
      _biometricsAvailable = available;
    });
  }

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _unlock() async {
    if (_passwordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('パスワードを入力してください')),
      );
      return;
    }

    setState(() => _isUnlocking = true);

    try {
      final vaultNotifier = ref.read(vaultProvider.notifier);
      await vaultNotifier.unlock(_passwordController.text);

      if (mounted) {
        context.go('/entries');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('ロック解除失敗: $e')),
      );
    } finally {
      setState(() => _isUnlocking = false);
    }
  }

  Future<void> _biometricsUnlock() async {
    try {
      final authenticated = await _biometricsService.authenticate();
      if (authenticated) {
        // TODO: Retrieve password from secure storage and unlock
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('バイオメトリクス認証エラー: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Vault のロック解除')),
      body: Center(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lock, size: 80),
                const SizedBox(height: 24),
                Text(
                  'kura',
                  style: Theme.of(context).textTheme.displayLarge,
                ),
                const SizedBox(height: 24),
                SecretField(
                  label: 'マスターパスワード',
                  onChanged: (value) {
                    _passwordController.text = value;
                  },
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _isUnlocking ? null : _unlock,
                  child: _isUnlocking
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('ロック解除'),
                ),
                if (_biometricsAvailable) ...[
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: _biometricsUnlock,
                    child: const Text('バイオメトリクスで認証'),
                  ),
                ],
                const SizedBox(height: 24),
                TextButton(
                  onPressed: () => context.go('/recovery-auth'),
                  child: const Text('リカバリーキーで復旧'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
