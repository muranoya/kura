// ignore_for_file: undefined_method, invalid_use_of_internal_member
import 'package:flutter/material.dart';
import '../bridge/frb_generated.dart';
import 'common/copy_button.dart';

class PasswordGeneratorModal extends StatefulWidget {
  final ValueChanged<String>? onPasswordGenerated;

  const PasswordGeneratorModal({
    Key? key,
    this.onPasswordGenerated,
  }) : super(key: key);

  @override
  State<PasswordGeneratorModal> createState() => _PasswordGeneratorModalState();
}

class _PasswordGeneratorModalState extends State<PasswordGeneratorModal> {
  int _length = 16;
  bool _includeUppercase = true;
  bool _includeLowercase = true;
  bool _includeNumbers = true;
  bool _includeSymbols = true;
  String? _generatedPassword;

  @override
  void initState() {
    super.initState();
    _generatePassword();
  }

  Future<void> _generatePassword() async {
    try {
      final password = await RustLib.instance.api.apiGeneratePassword(
        length: _length,
        includeUppercase: _includeUppercase,
        includeLowercase: _includeLowercase,
        includeNumbers: _includeNumbers,
        includeSymbols: _includeSymbols,
      );

      setState(() {
        _generatedPassword = password;
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('パスワード生成エラー: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('パスワード生成', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            if (_generatedPassword != null)
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _generatedPassword!,
                      style: const TextStyle(
                        fontSize: 16,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ),
                  CopyButton(value: _generatedPassword!),
                ],
              ),
            const SizedBox(height: 16),
            Slider(
              value: _length.toDouble(),
              min: 8,
              max: 64,
              divisions: 56,
              label: '$_length文字',
              onChanged: (value) {
                setState(() {
                  _length = value.toInt();
                });
                _generatePassword();
              },
            ),
            const SizedBox(height: 12),
            CheckboxListTile(
              title: const Text('大文字を含む'),
              value: _includeUppercase,
              onChanged: (value) {
                setState(() {
                  _includeUppercase = value ?? true;
                });
                _generatePassword();
              },
            ),
            CheckboxListTile(
              title: const Text('小文字を含む'),
              value: _includeLowercase,
              onChanged: (value) {
                setState(() {
                  _includeLowercase = value ?? true;
                });
                _generatePassword();
              },
            ),
            CheckboxListTile(
              title: const Text('数字を含む'),
              value: _includeNumbers,
              onChanged: (value) {
                setState(() {
                  _includeNumbers = value ?? true;
                });
                _generatePassword();
              },
            ),
            CheckboxListTile(
              title: const Text('記号を含む'),
              value: _includeSymbols,
              onChanged: (value) {
                setState(() {
                  _includeSymbols = value ?? true;
                });
                _generatePassword();
              },
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _generatedPassword != null
                  ? () {
                      widget.onPasswordGenerated?.call(_generatedPassword!);
                      Navigator.pop(context, _generatedPassword);
                    }
                  : null,
              child: const Text('このパスワードを使用'),
            ),
          ],
        ),
      ),
    );
  }
}

/// PasswordGeneratorModalを表示するヘルパー
Future<String?> showPasswordGeneratorModal(
  BuildContext context, {
  ValueChanged<String>? onPasswordGenerated,
}) async {
  return showModalBottomSheet<String>(
    context: context,
    builder: (context) => PasswordGeneratorModal(
      onPasswordGenerated: onPasswordGenerated,
    ),
  );
}
