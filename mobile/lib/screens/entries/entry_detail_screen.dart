// ignore_for_file: undefined_method, non_type_as_type_argument, undefined_getter
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/entry_detail_provider.dart';
import '../../widgets/entries/totp_display.dart';
import '../../widgets/common/confirm_dialog.dart';

class EntryDetailScreen extends ConsumerWidget {
  final String entryId;

  const EntryDetailScreen({
    Key? key,
    required this.entryId,
  }) : super(key: key);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entryAsync = ref.watch(entryDetailProvider(entryId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('エントリ詳細'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit),
            onPressed: () => context.go('/entries/$entryId/edit'),
          ),
          IconButton(
            icon: const Icon(Icons.delete),
            onPressed: () async {
              final confirmed = await showConfirmDialog(
                context,
                title: '削除',
                message: 'このエントリを削除しますか?',
              );
              if (confirmed) {
                // TODO: Call api_delete_entry
              }
            },
          ),
        ],
      ),
      body: entryAsync.when(
        data: (entry) => SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(entry!.name, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 8),
                Text(entry!.entryType),
                const SizedBox(height: 24),
                // TODO: Display typed_value fields based on entryType
                if (entry!.notes != null) ...[
                  const SizedBox(height: 16),
                  Text('メモ', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Text(entry!.notes!),
                ],
                if (entry!.labels.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('ラベル', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: entry!.labels
                        .map(
                          (label) => Chip(label: Text(label)),
                        )
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('エラー: $error')),
      ),
    );
  }
}
