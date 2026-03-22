import 'package:flutter/material.dart';
import 'dart:convert';
import '../../common/secret_field.dart';

class SshKeyForm extends StatefulWidget {
  final String? initialTypedValueJson;
  final ValueChanged<String> onTypedValueChanged;

  const SshKeyForm({
    Key? key,
    this.initialTypedValueJson,
    required this.onTypedValueChanged,
  }) : super(key: key);

  @override
  State<SshKeyForm> createState() => _SshKeyFormState();
}

class _SshKeyFormState extends State<SshKeyForm> {
  late TextEditingController _privateKeyController;
  late TextEditingController _passphraseController;

  @override
  void initState() {
    super.initState();

    if (widget.initialTypedValueJson != null) {
      try {
        final json = jsonDecode(widget.initialTypedValueJson!) as Map<String, dynamic>;
        _privateKeyController = TextEditingController(text: json['private_key'] ?? '');
        _passphraseController = TextEditingController(text: json['passphrase'] ?? '');
      } catch (e) {
        _initializeEmpty();
      }
    } else {
      _initializeEmpty();
    }

    _privateKeyController.addListener(_emitChange);
    _passphraseController.addListener(_emitChange);
  }

  void _initializeEmpty() {
    _privateKeyController = TextEditingController();
    _passphraseController = TextEditingController();
  }

  void _emitChange() {
    final json = jsonEncode({
      'private_key': _privateKeyController.text,
      'passphrase': _passphraseController.text.isEmpty ? null : _passphraseController.text,
    });
    widget.onTypedValueChanged(json);
  }

  @override
  void dispose() {
    _privateKeyController.dispose();
    _passphraseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SecretField(
          initialValue: _privateKeyController.text,
          label: '秘密鍵',
          minLines: 4,
          maxLines: 8,
          onChanged: (value) {
            _privateKeyController.text = value;
            _emitChange();
          },
        ),
        const SizedBox(height: 12),
        SecretField(
          initialValue: _passphraseController.text,
          label: 'パスフレーズ（オプション）',
          onChanged: (value) {
            _passphraseController.text = value;
            _emitChange();
          },
        ),
      ],
    );
  }
}
