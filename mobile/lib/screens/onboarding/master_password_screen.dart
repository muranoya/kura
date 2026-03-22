import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/vault_provider.dart';
import '../../widgets/common/secret_field.dart';

class MasterPasswordScreen extends ConsumerStatefulWidget {
  const MasterPasswordScreen({Key? key}) : super(key: key);

  @override
  ConsumerState<MasterPasswordScreen> createState() => _MasterPasswordScreenState();
}

class _MasterPasswordScreenState extends ConsumerState<MasterPasswordScreen> {
  late TextEditingController _passwordController;
  late TextEditingController _confirmController;
  bool _isCreating = false;

  @override
  void initState() {
    super.initState();
    _passwordController = TextEditingController();
    _confirmController = TextEditingController();
  }

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  double _getPasswordStrength(String password) {
    if (password.isEmpty) return 0;
    if (password.length < 8) return 0.25;
    if (password.length < 12) return 0.5;
    if (password.length < 16) return 0.75;
    return 1.0;
  }

  String _getStrengthLabel(double strength) {
    if (strength == 0) return '弱い';
    if (strength <= 0.25) return '非常に弱い';
    if (strength <= 0.5) return '弱い';
    if (strength <= 0.75) return '中程度';
    return '強い';
  }

  Color _getStrengthColor(double strength) {
    if (strength == 0) return Colors.grey;
    if (strength <= 0.25) return Colors.red;
    if (strength <= 0.5) return Colors.orange;
    if (strength <= 0.75) return Colors.yellow;
    return Colors.green;
  }

  Future<void> _createVault() async {
    if (_passwordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('パスワードを入力してください')),
      );
      return;
    }

    if (_passwordController.text != _confirmController.text) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('確認用パスワードが一致しません')),
      );
      return;
    }

    setState(() => _isCreating = true);

    try {
      final vaultNotifier = ref.read(vaultProvider.notifier);
      final recoveryKey = await vaultNotifier.createNew(_passwordController.text);

      if (mounted) {
        context.go('/onboarding/recovery-key', extra: recoveryKey);
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('エラー: $e')),
      );
    } finally {
      setState(() => _isCreating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strength = _getPasswordStrength(_passwordController.text);

    return Scaffold(
      appBar: AppBar(title: const Text('マスターパスワード設定')),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(
                'マスターパスワード',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              Text(
                'このパスワードはVaultのロック/アンロックに使用します。\n絶対に忘れないパスワードを設定してください。',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 24),
              SecretField(
                label: 'マスターパスワード',
                onChanged: (value) {
                  setState(() {
                    _passwordController.text = value;
                  });
                },
              ),
              const SizedBox(height: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'パスワード強度: ${_getStrengthLabel(strength)}',
                    style: TextStyle(color: _getStrengthColor(strength)),
                  ),
                  const SizedBox(height: 8),
                  LinearProgressIndicator(
                    value: strength,
                    backgroundColor: Colors.grey.shade300,
                    valueColor: AlwaysStoppedAnimation(_getStrengthColor(strength)),
                    minHeight: 8,
                  ),
                ],
              ),
              const SizedBox(height: 24),
              SecretField(
                label: '確認用パスワード',
                onChanged: (value) {
                  setState(() {
                    _confirmController.text = value;
                  });
                },
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _isCreating ? null : _createVault,
                child: _isCreating
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Vaultを作成'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
