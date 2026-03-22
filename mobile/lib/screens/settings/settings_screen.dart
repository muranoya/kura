import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/settings_provider.dart';
import '../../providers/vault_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('設定')),
      body: ListView(
        children: [
          // Security Section
          ListTile(
            title: const Text('セキュリティ'),
            textColor: Theme.of(context).primaryColor,
          ),
          ListTile(
            title: const Text('マスターパスワード変更'),
            onTap: () {
              // TODO: Navigate to change password screen
            },
          ),
          SwitchListTile(
            title: const Text('バイオメトリクス認証'),
            value: settings.enableBiometrics,
            onChanged: (value) {
              ref.read(settingsProvider.notifier).setEnableBiometrics(value);
            },
          ),
          const Divider(),
          // Behavior Section
          ListTile(
            title: const Text('動作'),
            textColor: Theme.of(context).primaryColor,
          ),
          ListTile(
            title: const Text('オートロック時間'),
            subtitle: Text('${settings.autoLockSeconds}秒'),
            onTap: () {
              // TODO: Show time picker
            },
          ),
          ListTile(
            title: const Text('クリップボード自動クリア'),
            subtitle: Text('${settings.clipboardClearSeconds}秒'),
            onTap: () {
              // TODO: Show time picker
            },
          ),
          SwitchListTile(
            title: const Text('プライベートモード'),
            value: settings.privateMode,
            onChanged: (value) {
              ref.read(settingsProvider.notifier).setPrivateMode(value);
            },
          ),
          const Divider(),
          // Storage Section
          ListTile(
            title: const Text('ストレージ'),
            textColor: Theme.of(context).primaryColor,
          ),
          ListTile(
            title: const Text('ストレージ設定を表示'),
            onTap: () {
              // TODO: Show storage config
            },
          ),
          ListTile(
            title: const Text('Argon2パラメータをアップグレード'),
            onTap: () {
              // TODO: Show upgrade screen
            },
          ),
          ListTile(
            title: const Text('DEKをローテーション'),
            onTap: () {
              // TODO: Show rotation screen
            },
          ),
          const Divider(),
          // Utility Section
          ListTile(
            title: const Text('ユーティリティ'),
            textColor: Theme.of(context).primaryColor,
          ),
          ListTile(
            title: const Text('情報'),
            onTap: () {
              // TODO: Show about screen
            },
          ),
          ListTile(
            title: const Text('ログアウト'),
            textColor: Colors.red,
            onTap: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('ログアウト'),
                  content: const Text('Vaultをロックしてアプリを終了しますか?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('キャンセル'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(context, true),
                      style: TextButton.styleFrom(foregroundColor: Colors.red),
                      child: const Text('ログアウト'),
                    ),
                  ],
                ),
              );

              if (confirmed ?? false) {
                await ref.read(vaultProvider.notifier).lock();
                if (context.mounted) {
                  context.go('/lock');
                }
              }
            },
          ),
        ],
      ),
    );
  }
}
