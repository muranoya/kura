// ignore_for_file: undefined_method, non_type_as_type_argument, undefined_getter
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/local_cache_service.dart';
import '../bridge/frb_generated.dart';

enum VaultStatus {
  uninitialized,
  locked,
  unlocking,
  unlocked,
  error,
}

class VaultState {
  final VaultStatus status;
  final String? errorMessage;
  final bool isBiometricsAvailable;

  VaultState({
    required this.status,
    this.errorMessage,
    this.isBiometricsAvailable = false,
  });

  VaultState copyWith({
    VaultStatus? status,
    String? errorMessage,
    bool? isBiometricsAvailable,
  }) {
    return VaultState(
      status: status ?? this.status,
      errorMessage: errorMessage,
      isBiometricsAvailable: isBiometricsAvailable ?? this.isBiometricsAvailable,
    );
  }
}

final localCacheServiceProvider = Provider((ref) => LocalCacheService());

final vaultProvider = NotifierProvider<VaultNotifier, VaultState>(() {
  return VaultNotifier();
});

class VaultNotifier extends Notifier<VaultState> {
  @override
  VaultState build() {
    return VaultState(status: VaultStatus.uninitialized);
  }

  LocalCacheService get _cacheService => ref.watch(localCacheServiceProvider);

  Future<void> initialize() async {
    try {
      final vaultBytes = await _cacheService.loadVaultBytes();
      if (vaultBytes == null) {
        state = state.copyWith(status: VaultStatus.uninitialized);
      } else {
        final etag = await _cacheService.loadEtag() ?? '';
        await RustLib.instance.api.apiLoadVault(vaultBytes: vaultBytes, etag: etag);
        state = state.copyWith(status: VaultStatus.locked);
      }
    } catch (e) {
      state = state.copyWith(
        status: VaultStatus.error,
        errorMessage: 'Failed to initialize vault: $e',
      );
    }
  }

  Future<String> createNew(String masterPassword) async {
    try {
      state = state.copyWith(status: VaultStatus.unlocking);
      final recoveryKey = await RustLib.instance.api.apiCreateNewVault(masterPassword: masterPassword);
      final vaultBytes = await RustLib.instance.api.apiGetVaultBytes();
      await _cacheService.saveVaultBytes(vaultBytes);
      state = state.copyWith(status: VaultStatus.unlocked);
      return recoveryKey;
    } catch (e) {
      state = state.copyWith(
        status: VaultStatus.error,
        errorMessage: 'Failed to create new vault: $e',
      );
      rethrow;
    }
  }

  Future<void> unlock(String masterPassword) async {
    try {
      state = state.copyWith(status: VaultStatus.unlocking);
      await RustLib.instance.api.apiUnlock(masterPassword: masterPassword);
      state = state.copyWith(status: VaultStatus.unlocked);
    } catch (e) {
      state = state.copyWith(
        status: VaultStatus.error,
        errorMessage: 'Failed to unlock vault: $e',
      );
      rethrow;
    }
  }

  Future<void> lock() async {
    try {
      final vaultBytes = await RustLib.instance.api.apiLock();
      await _cacheService.saveVaultBytes(vaultBytes);
      state = state.copyWith(status: VaultStatus.locked);
    } catch (e) {
      state = state.copyWith(
        status: VaultStatus.error,
        errorMessage: 'Failed to lock vault: $e',
      );
      rethrow;
    }
  }

  void onAppPaused() {
    // Auto-lock on app pause if enabled
  }

  void onAppResumed() {
    // Handle app resume
  }
}
