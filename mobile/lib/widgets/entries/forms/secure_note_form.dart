import 'package:flutter/material.dart';
import 'dart:convert';

class SecureNoteForm extends StatefulWidget {
  final String? initialTypedValueJson;
  final ValueChanged<String> onTypedValueChanged;

  const SecureNoteForm({
    Key? key,
    this.initialTypedValueJson,
    required this.onTypedValueChanged,
  }) : super(key: key);

  @override
  State<SecureNoteForm> createState() => _SecureNoteFormState();
}

class _SecureNoteFormState extends State<SecureNoteForm> {
  late TextEditingController _contentController;

  @override
  void initState() {
    super.initState();

    if (widget.initialTypedValueJson != null) {
      try {
        final json = jsonDecode(widget.initialTypedValueJson!) as Map<String, dynamic>;
        _contentController = TextEditingController(text: json['content'] ?? '');
      } catch (e) {
        _contentController = TextEditingController();
      }
    } else {
      _contentController = TextEditingController();
    }

    _contentController.addListener(_emitChange);
  }

  void _emitChange() {
    final json = jsonEncode({
      'content': _contentController.text,
    });
    widget.onTypedValueChanged(json);
  }

  @override
  void dispose() {
    _contentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _contentController,
      decoration: const InputDecoration(labelText: 'ノート'),
      minLines: 4,
      maxLines: 8,
    );
  }
}
