import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/entries_provider.dart';
import '../../providers/vault_provider.dart';
import '../../widgets/entries/entry_list_item.dart';

class EntryListScreen extends ConsumerStatefulWidget {
  const EntryListScreen({Key? key}) : super(key: key);

  @override
  ConsumerState<EntryListScreen> createState() => _EntryListScreenState();
}

class _EntryListScreenState extends ConsumerState<EntryListScreen> {
  late TextEditingController _searchController;

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final entriesAsync = ref.watch(entriesProvider);
    final filter = ref.watch(entryFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('エントリ'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: '検索...',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              onChanged: (query) {
                ref.read(entryFilterProvider.notifier).setSearchQuery(query.isEmpty ? null : query);
              },
            ),
          ),
        ),
      ),
      body: entriesAsync.when(
        data: (entries) => entries.isEmpty
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.lock, size: 80, color: Colors.grey),
                    const SizedBox(height: 16),
                    Text(
                      'エントリなし',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ],
                ),
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
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.go('/entries/create'),
        child: const Icon(Icons.add),
      ),
    );
  }
}
