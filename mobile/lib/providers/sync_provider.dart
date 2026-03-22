// ignore_for_file: undefined_method, non_type_as_type_argument, undefined_getter
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../bridge/frb_generated.dart';

enum SyncStatus { idle, syncing, success, conflict, error }

class SyncState {
  final SyncStatus status;
  final DateTime? lastSyncedAt;
  final String? errorMessage;
  final List<DartConflict>? conflicts;

  SyncState({
    this.status = SyncStatus.idle,
    this.lastSyncedAt,
    this.errorMessage,
    this.conflicts,
  });

  SyncState copyWith({
    SyncStatus? status,
    DateTime? lastSyncedAt,
    String? errorMessage,
    List<DartConflict>? conflicts,
  }) {
    return SyncState(
      status: status ?? this.status,
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
      errorMessage: errorMessage,
      conflicts: conflicts,
    );
  }
}

final syncProvider = NotifierProvider<SyncNotifier, SyncState>(() {
  return SyncNotifier();
});

class SyncNotifier extends Notifier<SyncState> {
  @override
  SyncState build() {
    return SyncState();
  }

  /// 同期を実行
  Future<void> sync(String storageConfig) async {
    try {
      state = state.copyWith(status: SyncStatus.syncing);

      final result = await RustLib.instance.api.apiSync(storageConfig: storageConfig);

      if (result.hasConflicts) {
        state = state.copyWith(
          status: SyncStatus.conflict,
          conflicts: result.conflicts,
          lastSyncedAt: DateTime.now(),
        );
      } else {
        state = state.copyWith(
          status: SyncStatus.success,
          lastSyncedAt: DateTime.now(),
        );
      }
    } catch (e) {
      state = state.copyWith(
        status: SyncStatus.error,
        errorMessage: e.toString(),
      );
    }
  }

  /// プッシュを実行
  Future<void> push(String storageConfig) async {
    try {
      state = state.copyWith(status: SyncStatus.syncing);
      await RustLib.instance.api.apiPush(storageConfig: storageConfig);
      state = state.copyWith(
        status: SyncStatus.success,
        lastSyncedAt: DateTime.now(),
      );
    } catch (e) {
      state = state.copyWith(
        status: SyncStatus.error,
        errorMessage: e.toString(),
      );
    }
  }

  /// 同期ステータスをリセット
  void reset() {
    state = SyncState();
  }
}
