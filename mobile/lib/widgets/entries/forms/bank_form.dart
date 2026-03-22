import 'package:flutter/material.dart';
import 'dart:convert';
import '../../common/secret_field.dart';

class BankForm extends StatefulWidget {
  final String? initialTypedValueJson;
  final ValueChanged<String> onTypedValueChanged;

  const BankForm({
    Key? key,
    this.initialTypedValueJson,
    required this.onTypedValueChanged,
  }) : super(key: key);

  @override
  State<BankForm> createState() => _BankFormState();
}

class _BankFormState extends State<BankForm> {
  late TextEditingController _bankNameController;
  late TextEditingController _accountNumberController;
  late TextEditingController _pinController;

  @override
  void initState() {
    super.initState();

    if (widget.initialTypedValueJson != null) {
      try {
        final json = jsonDecode(widget.initialTypedValueJson!) as Map<String, dynamic>;
        _bankNameController = TextEditingController(text: json['bank_name'] ?? '');
        _accountNumberController = TextEditingController(text: json['account_number'] ?? '');
        _pinController = TextEditingController(text: json['pin'] ?? '');
      } catch (e) {
        _initializeEmpty();
      }
    } else {
      _initializeEmpty();
    }

    _bankNameController.addListener(_emitChange);
    _accountNumberController.addListener(_emitChange);
    _pinController.addListener(_emitChange);
  }

  void _initializeEmpty() {
    _bankNameController = TextEditingController();
    _accountNumberController = TextEditingController();
    _pinController = TextEditingController();
  }

  void _emitChange() {
    final json = jsonEncode({
      'bank_name': _bankNameController.text,
      'account_number': _accountNumberController.text,
      'pin': _pinController.text,
    });
    widget.onTypedValueChanged(json);
  }

  @override
  void dispose() {
    _bankNameController.dispose();
    _accountNumberController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TextField(
          controller: _bankNameController,
          decoration: const InputDecoration(labelText: '銀行名'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _accountNumberController,
          decoration: const InputDecoration(labelText: '口座番号'),
        ),
        const SizedBox(height: 12),
        SecretField(
          initialValue: _pinController.text,
          label: 'PIN',
          onChanged: (value) {
            _pinController.text = value;
            _emitChange();
          },
        ),
      ],
    );
  }
}
