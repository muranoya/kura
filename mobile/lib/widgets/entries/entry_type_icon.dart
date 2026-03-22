import 'package:flutter/material.dart';

class EntryTypeIcon extends StatelessWidget {
  final String entryType;
  final double size;

  const EntryTypeIcon({
    Key? key,
    required this.entryType,
    this.size = 24,
  }) : super(key: key);

  IconData _getIconData() {
    switch (entryType.toLowerCase()) {
      case 'login':
        return Icons.person;
      case 'bank':
        return Icons.account_balance;
      case 'ssh_key':
        return Icons.key;
      case 'secure_note':
        return Icons.note;
      case 'credit_card':
        return Icons.credit_card;
      case 'passkey':
        return Icons.fingerprint;
      default:
        return Icons.lock;
    }
  }

  Color _getColor() {
    switch (entryType.toLowerCase()) {
      case 'login':
        return Colors.blue;
      case 'bank':
        return Colors.green;
      case 'ssh_key':
        return Colors.orange;
      case 'secure_note':
        return Colors.yellow;
      case 'credit_card':
        return Colors.purple;
      case 'passkey':
        return Colors.teal;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Icon(
      _getIconData(),
      size: size,
      color: _getColor(),
    );
  }
}
