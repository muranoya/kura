import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/vault_provider.dart';
import '../../widgets/common/secret_field.dart';

class RecoveryAuthScreen extends ConsumerStatefulWidget {
  const RecoveryAuthScreen({Key? key}) : super(key: key);

  @override
  ConsumerState<RecoveryAuthScreen> createState() => _RecoveryAuthScreenState();
}

class _RecoveryAuthScreenState extends ConsumerState<RecoveryAuthScreen> {
  late TextEditingController _recoveryKeyController;
  late TextEditingController _newPasswordController;
  late TextEditingController _confirmPasswordController;
  bool _isProcessing = false;
  int _step = 1; // Step 1: Enter recovery key, Step 2: Set new password

  @override
  void initState() {
    super.initState();
    _recoveryKeyController = TextEditingController();
    _newPasswordController = TextEditingController();
    _confirmPasswordController = TextEditingController();
  }

  @override
  void dispose() {
    _recoveryKeyController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _unlockWithRecoveryKey() async {
    if (_recoveryKeyController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('リカバリーキーを入力してください')),
      );
      return;
    }

    setState(() => _isProcessing = true);

    try {
      final vaultNotifier = ref.read(vaultProvider.notifier);
      await vaultNotifier.ref.read(vaultProvider.notifier);
      // TODO: Call api_unlock_with_recovery_key
      // await RustLib.instance.api.apiUnlockWithRecoveryKey(recoveryKey: _recoveryKeyController.text);

      setState(() => _step = 2);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('リカバリーキー無効: $e')),
      );
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  Future<void> _setNewPassword() async {
    if (_newPasswordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('新しいパスワードを入力してください')),
      );
      return;
    }

    if (_newPasswordController.text != _confirmPasswordController.text) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('確認用パスワードが一致しません')),
      );
      return;
    }

    setState(() => _isProcessing = true);

    try {
      final vaultNotifier = ref.read(vaultProvider.notifier);
      // TODO: Call api_change_master_password
      // await RustLib.instance.api.apiChangeMasterPassword(
      //   oldPassword: _recoveryKeyController.text,
      //   newPassword: _newPasswordController.text,
      // );

      if (mounted) {
        context.go('/entries');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('パスワード設定エラー: $e')),
      );
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('リカバリーキーで復旧')),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: _step == 1
              ? Column(
                  children: [
                    Text(
                      'リカバリーキーを入力',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _recoveryKeyController,
                      decoration: const InputDecoration(
                        labelText: 'リカバリーキー',
                        hintText: 'ダッシュなし',
                      ),
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: _isProcessing ? null : _unlockWithRecoveryKey,
                      child: _isProcessing
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('確認'),
                    ),
                  ],
                )
              : Column(
                  children: [
                    Text(
                      '新しいパスワードを設定',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 16),
                    SecretField(
                      label: '新しいパスワード',
                      onChanged: (value) {
                        _newPasswordController.text = value;
                      },
                    ),
                    const SizedBox(height: 12),
                    SecretField(
                      label: '確認用パスワード',
                      onChanged: (value) {
                        _confirmPasswordController.text = value;
                      },
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: _isProcessing ? null : _setNewPassword,
                      child: _isProcessing
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('パスワードを設定'),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
