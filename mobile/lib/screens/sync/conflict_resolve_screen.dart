// ignore_for_file: non_type_as_type_argument
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../bridge/frb_generated.dart';
import '../../providers/sync_provider.dart';

class ConflictResolveScreen extends ConsumerStatefulWidget {
  final List<DartConflict> conflicts;

  const ConflictResolveScreen({
    Key? key,
    required this.conflicts,
  }) : super(key: key);

  @override
  ConsumerState<ConflictResolveScreen> createState() => _ConflictResolveScreenState();
}

class _ConflictResolveScreenState extends ConsumerState<ConflictResolveScreen> {
  final Map<String, String> _resolutions = {}; // entryId -> resolution

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('コンフリクト解決')),
      body: ListView.builder(
        itemCount: widget.conflicts.length,
        itemBuilder: (context, index) {
          final conflict = widget.conflicts[index];
          final resolution = _resolutions[conflict.id] ?? 'useLocal';

          return Card(
            margin: const EdgeInsets.all(8),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    conflict.entryName,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text('コンフリクトタイプ: ${conflict.conflictType}'),
                  const SizedBox(height: 16),
                  RadioListTile<String>(
                    title: const Text('ローカル版を使用'),
                    value: 'useLocal',
                    groupValue: resolution,
                    onChanged: (value) {
                      setState(() => _resolutions[conflict.id] = value ?? 'useLocal');
                    },
                  ),
                  RadioListTile<String>(
                    title: const Text('リモート版を使用'),
                    value: 'useRemote',
                    groupValue: resolution,
                    onChanged: (value) {
                      setState(() => _resolutions[conflict.id] = value ?? 'useRemote');
                    },
                  ),
                  RadioListTile<String>(
                    title: const Text('削除'),
                    value: 'delete',
                    groupValue: resolution,
                    onChanged: (value) {
                      setState(() => _resolutions[conflict.id] = value ?? 'delete');
                    },
                  ),
                ],
              ),
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          // TODO: Apply resolutions
          for (final conflict in widget.conflicts) {
            final resolution = _resolutions[conflict.id] ?? 'useLocal';
            // await ref.read(syncProvider.notifier).resolveConflict(conflict.id, resolution);
          }
          Navigator.pop(context);
        },
        child: const Icon(Icons.check),
      ),
    );
  }
}
