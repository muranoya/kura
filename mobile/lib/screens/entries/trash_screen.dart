import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/entries_provider.dart';
import '../../widgets/entries/entry_list_item.dart';
import '../../widgets/common/confirm_dialog.dart';

class TrashScreen extends ConsumerWidget {
  const TrashScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Watch entries with includeDeleted = true
    final filter = ref.watch(entryFilterProvider);
    ref.read(entryFilterProvider.notifier).setIncludeDeleted(true);
    final entriesAsync = ref.watch(entriesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('ゴミ箱'),
        actions: [
          if (entriesAsync.maybeWhen(
            data: (entries) => entries.isNotEmpty,
            orElse: () => false,
          ))
            TextButton(
              onPressed: () async {
                final confirmed = await showConfirmDialog(
                  context,
                  title: 'ゴミ箱を空にする',
                  message: 'ゴミ箱のすべてのエントリを完全に削除しますか?',
                  confirmText: '削除',
                );
                if (confirmed) {
                  // TODO: Implement purge all
                }
              },
              child: const Text('空にする'),
            ),
        ],
      ),
      body: entriesAsync.when(
        data: (entries) => entries.isEmpty
            ? const Center(
                child: Text('ゴミ箱は空です'),
              )
            : ListView.builder(
                itemCount: entries.length,
                itemBuilder: (context, index) {
                  final entry = entries[index];
                  return EntryListItem(
                    entry: entry,
                    onTap: () => context.go('/entries/${entry.id}'),
                    onFavoriteTap: () {
                      // TODO: Toggle favorite
                    },
                  );
                },
              ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('エラー: $error')),
      ),
    );
  }
}
