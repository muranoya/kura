// ignore_for_file: undefined_method

/// Vault Core API のラッパーサービス
/// FRBの生成メソッドをラップして提供
import '../bridge/frb_generated.dart';

class VaultApiService {
  /// 新規Vaultを作成し、RecoveryKeyを返す
  Future<String> createNewVault(String masterPassword) async {
    try {
      return await RustLib.instance.api.apiCreateNewVault(masterPassword: masterPassword);
    } catch (e) {
      // TODO: FRB generation issues - fallback to mock
      throw Exception('Failed to create vault: $e');
    }
  }

  /// 既存Vaultをメモリに読み込む
  Future<void> loadVault(List<int> vaultBytes, String etag) async {
    try {
      return await RustLib.instance.api.apiLoadVault(vaultBytes: vaultBytes, etag: etag);
    } catch (e) {
      throw Exception('Failed to load vault: $e');
    }
  }

  /// マスターパスワードでアンロック
  Future<void> unlock(String masterPassword) async {
    try {
      return await RustLib.instance.api.apiUnlock(masterPassword: masterPassword);
    } catch (e) {
      throw Exception('Failed to unlock vault: $e');
    }
  }

  /// ロック（vault_bytesを返す）
  Future<List<int>> lock() async {
    try {
      return await RustLib.instance.api.apiLock();
    } catch (e) {
      throw Exception('Failed to lock vault: $e');
    }
  }

  /// 現在のvault_bytesを取得
  Future<List<int>> getVaultBytes() async {
    try {
      return await RustLib.instance.api.apiGetVaultBytes();
    } catch (e) {
      throw Exception('Failed to get vault bytes: $e');
    }
  }

  /// エントリ一覧を取得
  Future<List<DartEntryRow>> listEntries({
    String? searchQuery,
    String? entryType,
    String? labelId,
    bool includeTrash = false,
  }) async {
    try {
      return await RustLib.instance.api.apiListEntries(
        searchQuery: searchQuery,
        entryType: entryType,
        labelId: labelId,
        includeTrash: includeTrash,
      );
    } catch (e) {
      throw Exception('Failed to list entries: $e');
    }
  }

  /// エントリ詳細を取得
  Future<DartEntry> getEntry(String id) async {
    try {
      return await RustLib.instance.api.apiGetEntry(id: id);
    } catch (e) {
      throw Exception('Failed to get entry: $e');
    }
  }

  /// ラベル一覧を取得
  Future<List<DartLabel>> listLabels() async {
    try {
      return await RustLib.instance.api.apiListLabels();
    } catch (e) {
      throw Exception('Failed to list labels: $e');
    }
  }

  /// TOTP生成（デフォルト）
  Future<String> generateTotpDefault(String secret) async {
    try {
      return await RustLib.instance.api.apiGenerateTotpDefault(secret: secret);
    } catch (e) {
      throw Exception('Failed to generate TOTP: $e');
    }
  }

  /// パスワード生成
  Future<String> generatePassword({
    required int length,
    required bool includeUppercase,
    required bool includeLowercase,
    required bool includeNumbers,
    required bool includeSymbols,
  }) async {
    try {
      return await RustLib.instance.api.apiGeneratePassword(
        length: length,
        includeUppercase: includeUppercase,
        includeLowercase: includeLowercase,
        includeNumbers: includeNumbers,
        includeSymbols: includeSymbols,
      );
    } catch (e) {
      throw Exception('Failed to generate password: $e');
    }
  }

  /// S3から同期（コンフリクト検出）
  Future<DartSyncResult> sync(String storageConfig) async {
    try {
      return await RustLib.instance.api.apiSync(storageConfig: storageConfig);
    } catch (e) {
      throw Exception('Failed to sync: $e');
    }
  }

  /// S3へプッシュ
  Future<void> push(String storageConfig) async {
    try {
      return await RustLib.instance.api.apiPush(storageConfig: storageConfig);
    } catch (e) {
      throw Exception('Failed to push: $e');
    }
  }
}
