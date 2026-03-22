import 'package:flutter/material.dart';

class SecretField extends StatefulWidget {
  final String? initialValue;
  final String? label;
  final String? hintText;
  final ValueChanged<String>? onChanged;
  final int minLines;
  final int maxLines;

  const SecretField({
    Key? key,
    this.initialValue,
    this.label,
    this.hintText,
    this.onChanged,
    this.minLines = 1,
    this.maxLines = 1,
  }) : super(key: key);

  @override
  State<SecretField> createState() => _SecretFieldState();
}

class _SecretFieldState extends State<SecretField> {
  late TextEditingController _controller;
  bool _obscureText = true;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      obscureText: _obscureText,
      minLines: widget.minLines,
      maxLines: widget.maxLines,
      onChanged: widget.onChanged,
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: widget.hintText,
        suffixIcon: IconButton(
          icon: Icon(_obscureText ? Icons.visibility : Icons.visibility_off),
          onPressed: () {
            setState(() {
              _obscureText = !_obscureText;
            });
          },
        ),
      ),
    );
  }
}
