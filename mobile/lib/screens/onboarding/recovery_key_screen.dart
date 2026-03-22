import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../widgets/common/copy_button.dart';

class RecoveryKeyScreen extends StatefulWidget {
  final String recoveryKey;

  const RecoveryKeyScreen({
    Key? key,
    required this.recoveryKey,
  }) : super(key: key);

  @override
  State<RecoveryKeyScreen> createState() => _RecoveryKeyScreenState();
}

class _RecoveryKeyScreenState extends State<RecoveryKeyScreen> {
  late TextEditingController _confirmController;
  bool _confirmed = false;

  @override
  void initState() {
    super.initState();
    _confirmController = TextEditingController();
  }

  @override
  void dispose() {
    _confirmController.dispose();
    super.dispose();
  }

  void _checkConfirmation() {
    setState(() {
      _confirmed = _confirmController.text == widget.recoveryKey;
    });
  }

  Future<void> _finish() async {
    if (!_confirmed) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('リカバリーキーが一致しません')),
      );
      return;
    }

    if (mounted) {
      context.go('/entries');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('リカバリーキー')),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(
                'リカバリーキーを保管してください',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.warning, color: Colors.orange.shade700),
                        const SizedBox(width: 8),
                        Text(
                          '重要',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.orange.shade700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'マスターパスワードを忘れた場合、このリカバリーキーがVaultへの唯一のアクセス手段です。\n\n紙に印刷して安全な場所に保管してください。',
                      style: TextStyle(color: Colors.orange.shade800),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: SelectableText(
                        widget.recoveryKey,
                        style: const TextStyle(
                          fontSize: 14,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                    CopyButton(value: widget.recoveryKey),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'リカバリーキーを確認入力してください',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _confirmController,
                decoration: const InputDecoration(
                  labelText: 'リカバリーキー確認入力',
                  hintText: 'ダッシュなし',
                ),
                onChanged: (_) => _checkConfirmation(),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _confirmed ? _finish : null,
                child: const Text('完了'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
