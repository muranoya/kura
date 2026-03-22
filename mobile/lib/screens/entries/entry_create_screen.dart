import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class EntryCreateScreen extends StatelessWidget {
  const EntryCreateScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final entryTypes = [
      ('login', 'ログイン', Icons.person),
      ('bank', '銀行口座', Icons.account_balance),
      ('ssh_key', 'SSHキー', Icons.key),
      ('secure_note', 'セキュアノート', Icons.note),
      ('credit_card', 'クレジットカード', Icons.credit_card),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('エントリを作成')),
      body: ListView.builder(
        itemCount: entryTypes.length,
        itemBuilder: (context, index) {
          final (type, label, icon) = entryTypes[index];
          return ListTile(
            leading: Icon(icon),
            title: Text(label),
            onTap: () => context.go('/entries/create/$type'),
          );
        },
      ),
    );
  }
}
