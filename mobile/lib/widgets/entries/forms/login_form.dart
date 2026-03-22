import 'package:flutter/material.dart';
import 'dart:convert';
import '../../common/secret_field.dart';

class LoginForm extends StatefulWidget {
  final String? initialTypedValueJson;
  final ValueChanged<String> onTypedValueChanged;

  const LoginForm({
    Key? key,
    this.initialTypedValueJson,
    required this.onTypedValueChanged,
  }) : super(key: key);

  @override
  State<LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends State<LoginForm> {
  late TextEditingController _urlController;
  late TextEditingController _usernameController;
  late TextEditingController _passwordController;
  late TextEditingController _totpController;

  @override
  void initState() {
    super.initState();

    // Parse initial value if provided
    if (widget.initialTypedValueJson != null) {
      try {
        final json = jsonDecode(widget.initialTypedValueJson!) as Map<String, dynamic>;
        _urlController = TextEditingController(text: json['url'] ?? '');
        _usernameController = TextEditingController(text: json['username'] ?? '');
        _passwordController = TextEditingController(text: json['password'] ?? '');
        _totpController = TextEditingController(text: json['totp'] ?? '');
      } catch (e) {
        _initializeEmpty();
      }
    } else {
      _initializeEmpty();
    }

    // Listen to changes
    _urlController.addListener(_emitChange);
    _usernameController.addListener(_emitChange);
    _passwordController.addListener(_emitChange);
    _totpController.addListener(_emitChange);
  }

  void _initializeEmpty() {
    _urlController = TextEditingController();
    _usernameController = TextEditingController();
    _passwordController = TextEditingController();
    _totpController = TextEditingController();
  }

  void _emitChange() {
    final json = jsonEncode({
      'url': _urlController.text,
      'username': _usernameController.text,
      'password': _passwordController.text,
      'totp': _totpController.text.isEmpty ? null : _totpController.text,
    });
    widget.onTypedValueChanged(json);
  }

  @override
  void dispose() {
    _urlController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    _totpController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TextField(
          controller: _urlController,
          decoration: const InputDecoration(labelText: 'URL'),
          keyboardType: TextInputType.url,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _usernameController,
          decoration: const InputDecoration(labelText: 'ユーザー名/メール'),
        ),
        const SizedBox(height: 12),
        SecretField(
          initialValue: _passwordController.text,
          label: 'パスワード',
          onChanged: (value) {
            _passwordController.text = value;
            _emitChange();
          },
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _totpController,
          decoration: const InputDecoration(labelText: 'TOTP シークレット（オプション）'),
        ),
      ],
    );
  }
}
