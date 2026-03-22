import 'package:flutter/material.dart';
import 'dart:convert';
import '../../common/secret_field.dart';

class CreditCardForm extends StatefulWidget {
  final String? initialTypedValueJson;
  final ValueChanged<String> onTypedValueChanged;

  const CreditCardForm({
    Key? key,
    this.initialTypedValueJson,
    required this.onTypedValueChanged,
  }) : super(key: key);

  @override
  State<CreditCardForm> createState() => _CreditCardFormState();
}

class _CreditCardFormState extends State<CreditCardForm> {
  late TextEditingController _cardholderController;
  late TextEditingController _numberController;
  late TextEditingController _expiryController;
  late TextEditingController _cvvController;

  @override
  void initState() {
    super.initState();

    if (widget.initialTypedValueJson != null) {
      try {
        final json = jsonDecode(widget.initialTypedValueJson!) as Map<String, dynamic>;
        _cardholderController = TextEditingController(text: json['cardholder'] ?? '');
        _numberController = TextEditingController(text: json['number'] ?? '');
        _expiryController = TextEditingController(text: json['expiry'] ?? '');
        _cvvController = TextEditingController(text: json['cvv'] ?? '');
      } catch (e) {
        _initializeEmpty();
      }
    } else {
      _initializeEmpty();
    }

    _cardholderController.addListener(_emitChange);
    _numberController.addListener(_emitChange);
    _expiryController.addListener(_emitChange);
    _cvvController.addListener(_emitChange);
  }

  void _initializeEmpty() {
    _cardholderController = TextEditingController();
    _numberController = TextEditingController();
    _expiryController = TextEditingController();
    _cvvController = TextEditingController();
  }

  void _emitChange() {
    final json = jsonEncode({
      'cardholder': _cardholderController.text,
      'number': _numberController.text,
      'expiry': _expiryController.text,
      'cvv': _cvvController.text,
    });
    widget.onTypedValueChanged(json);
  }

  @override
  void dispose() {
    _cardholderController.dispose();
    _numberController.dispose();
    _expiryController.dispose();
    _cvvController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TextField(
          controller: _cardholderController,
          decoration: const InputDecoration(labelText: 'カード名義人'),
        ),
        const SizedBox(height: 12),
        SecretField(
          initialValue: _numberController.text,
          label: 'カード番号',
          onChanged: (value) {
            _numberController.text = value;
            _emitChange();
          },
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _expiryController,
          decoration: const InputDecoration(labelText: '有効期限（MM/YY）'),
        ),
        const SizedBox(height: 12),
        SecretField(
          initialValue: _cvvController.text,
          label: 'CVV',
          onChanged: (value) {
            _cvvController.text = value;
            _emitChange();
          },
        ),
      ],
    );
  }
}
