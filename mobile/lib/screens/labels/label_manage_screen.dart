import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/labels_provider.dart';

class LabelManageScreen extends ConsumerStatefulWidget {
  const LabelManageScreen({Key? key}) : super(key: key);

  @override
  ConsumerState<LabelManageScreen> createState() => _LabelManageScreenState();
}

class _LabelManageScreenState extends ConsumerState<LabelManageScreen> {
  late TextEditingController _newLabelController;

  @override
  void initState() {
    super.initState();
    _newLabelController = TextEditingController();
  }

  @override
  void dispose() {
    _newLabelController.dispose();
    super.dispose();
  }

  Future<void> _createLabel() async {
    if (_newLabelController.text.isEmpty) return;

    try {
      // TODO: Call api_create_label
      _newLabelController.clear();
      ref.refresh(labelsProvider);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('エラー: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final labelsAsync = ref.watch(labelsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('ラベル管理')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _newLabelController,
                    decoration: const InputDecoration(
                      labelText: '新しいラベル',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _createLabel,
                  child: const Icon(Icons.add),
                ),
              ],
            ),
          ),
          Expanded(
            child: labelsAsync.when(
              data: (labels) => labels.isEmpty
                  ? const Center(child: Text('ラベルなし'))
                  : ListView.builder(
                      itemCount: labels.length,
                      itemBuilder: (context, index) {
                        final label = labels[index];
                        return Dismissible(
                          key: Key(label.id),
                          onDismissed: (direction) {
                            // TODO: Call api_delete_label
                            ref.refresh(labelsProvider);
                          },
                          background: Container(
                            color: Colors.red,
                            alignment: Alignment.centerRight,
                            padding: const EdgeInsets.only(right: 16),
                            child: const Icon(Icons.delete, color: Colors.white),
                          ),
                          child: ListTile(
                            title: Text(label.name),
                          ),
                        );
                      },
                    ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text('エラー: $error')),
            ),
          ),
        ],
      ),
    );
  }
}
