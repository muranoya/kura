import 'package:flutter/material.dart';
import '../../bridge/frb_generated.dart';
import 'entry_type_icon.dart';

class EntryListItem extends StatelessWidget {
  final DartEntryRow entry;
  final VoidCallback onTap;
  final VoidCallback? onFavoriteTap;

  const EntryListItem({
    Key? key,
    required this.entry,
    required this.onTap,
    this.onFavoriteTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final isDeleted = entry.deletedAt != null;

    return ListTile(
      leading: EntryTypeIcon(entryType: entry.entryType),
      title: Text(
        entry.name,
        style: TextStyle(
          decoration: isDeleted ? TextDecoration.lineThrough : null,
        ),
      ),
      subtitle: Text(entry.entryType),
      trailing: IconButton(
        icon: Icon(
          entry.isFavorite ? Icons.favorite : Icons.favorite_border,
          color: entry.isFavorite ? Colors.red : null,
        ),
        onPressed: onFavoriteTap,
      ),
      onTap: onTap,
    );
  }
}
