// ignore_for_file: undefined_method, non_type_as_type_argument, undefined_getter
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/entry_detail_provider.dart';
import '../../widgets/entries/forms/login_form.dart';
import '../../widgets/entries/forms/bank_form.dart';
import '../../widgets/entries/forms/ssh_key_form.dart';
import '../../widgets/entries/forms/secure_note_form.dart';
import '../../widgets/entries/forms/credit_card_form.dart';

class EntryEditScreen extends ConsumerStatefulWidget {
  final String entryId;

  const EntryEditScreen({
    Key? key,
    required this.entryId,
  }) : super(key: key);

  @override
  ConsumerState<EntryEditScreen> createState() => _EntryEditScreenState();
}

class _EntryEditScreenState extends ConsumerState<EntryEditScreen> {
  late TextEditingController _nameController;
  late TextEditingController _notesController;
  String? _typedValueJson;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _notesController = TextEditingController();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_nameController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('名前を入力してください')),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      // TODO: Call api_update_entry
      if (mounted) {
        context.pop();
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('保存エラー: $e')),
      );
    } finally {
      setState(() => _isSaving = false);
    }
  }

  Widget _buildFormForType(String entryType, String? initialTypedValueJson) {
    switch (entryType) {
      case 'login':
        return LoginForm(
          initialTypedValueJson: initialTypedValueJson,
          onTypedValueChanged: (json) => _typedValueJson = json,
        );
      case 'bank':
        return BankForm(
          initialTypedValueJson: initialTypedValueJson,
          onTypedValueChanged: (json) => _typedValueJson = json,
        );
      case 'ssh_key':
        return SshKeyForm(
          initialTypedValueJson: initialTypedValueJson,
          onTypedValueChanged: (json) => _typedValueJson = json,
        );
      case 'secure_note':
        return SecureNoteForm(
          initialTypedValueJson: initialTypedValueJson,
          onTypedValueChanged: (json) => _typedValueJson = json,
        );
      case 'credit_card':
        return CreditCardForm(
          initialTypedValueJson: initialTypedValueJson,
          onTypedValueChanged: (json) => _typedValueJson = json,
        );
      default:
        return const SizedBox.shrink();
    }
  }

  @override
  Widget build(BuildContext context) {
    final entryAsync = ref.watch(entryDetailProvider(widget.entryId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('エントリを編集'),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _save,
            child: _isSaving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('保存'),
          ),
        ],
      ),
      body: entryAsync.when(
        data: (entry) {
          _nameController.text = entry!.name;
          _notesController.text = entry!.notes ?? '';
          _typedValueJson ??= entry!.typedValue;

          return SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  TextField(
                    controller: _nameController,
                    decoration: const InputDecoration(labelText: '名前'),
                  ),
                  const SizedBox(height: 16),
                  _buildFormForType(entry!.entryType, entry!.typedValue),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _notesController,
                    decoration: const InputDecoration(labelText: 'メモ'),
                    minLines: 3,
                    maxLines: 5,
                  ),
                ],
              ),
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('エラー: $error')),
      ),
    );
  }
}
