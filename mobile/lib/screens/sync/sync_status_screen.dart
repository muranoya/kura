import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/sync_provider.dart';

class SyncStatusScreen extends ConsumerWidget {
  const SyncStatusScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final syncState = ref.watch(syncProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('同期状態')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                syncState.status == SyncStatus.syncing
                    ? Icons.cloud_upload
                    : Icons.cloud_done,
                size: 80,
                color: syncState.status == SyncStatus.success ? Colors.green : Colors.grey,
              ),
              const SizedBox(height: 16),
              Text(
                syncState.status.name,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              if (syncState.lastSyncedAt != null)
                Text('最終同期: ${syncState.lastSyncedAt}'),
              if (syncState.errorMessage != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'エラー: ${syncState.errorMessage}',
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: syncState.status != SyncStatus.syncing
                    ? () {
                        // TODO: Call sync
                      }
                    : null,
                child: const Text('手動同期'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
