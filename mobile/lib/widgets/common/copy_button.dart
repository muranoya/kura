import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/clipboard_service.dart';

class CopyButton extends ConsumerStatefulWidget {
  final String value;
  final int clearSeconds;

  const CopyButton({
    Key? key,
    required this.value,
    this.clearSeconds = 30,
  }) : super(key: key);

  @override
  ConsumerState<CopyButton> createState() => _CopyButtonState();
}

class _CopyButtonState extends ConsumerState<CopyButton> {
  bool _copied = false;
  late final ClipboardService _clipboardService;

  @override
  void initState() {
    super.initState();
    _clipboardService = ClipboardService();
  }

  @override
  void dispose() {
    _clipboardService.dispose();
    super.dispose();
  }

  Future<void> _copy() async {
    await _clipboardService.copyWithTimer(widget.value, seconds: widget.clearSeconds);
    setState(() {
      _copied = true;
    });

    // Show "Copied" status for 2 seconds
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) {
      setState(() {
        _copied = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: Icon(_copied ? Icons.check : Icons.content_copy),
      color: _copied ? Colors.green : null,
      onPressed: _copy,
      tooltip: '${widget.value}をコピー',
    );
  }
}
