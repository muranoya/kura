import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/sync_provider.dart';

class SyncStatusIndicator extends ConsumerWidget {
  final double size;
  final Color? idleColor;
  final Color? syncingColor;
  final Color? successColor;
  final Color? errorColor;

  const SyncStatusIndicator({
    Key? key,
    this.size = 24,
    this.idleColor,
    this.syncingColor,
    this.errorColor,
    this.successColor,
  }) : super(key: key);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final syncState = ref.watch(syncProvider);

    switch (syncState.status) {
      case SyncStatus.idle:
        return Icon(Icons.cloud_off, size: size, color: idleColor);
      case SyncStatus.syncing:
        return SizedBox(
          width: size,
          height: size,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation(syncingColor ?? Colors.blue),
          ),
        );
      case SyncStatus.success:
        return Icon(Icons.cloud_done, size: size, color: successColor ?? Colors.green);
      case SyncStatus.conflict:
        return Icon(Icons.cloud_queue, size: size, color: Colors.orange);
      case SyncStatus.error:
        return Icon(Icons.cloud_off, size: size, color: errorColor ?? Colors.red);
    }
  }
}
