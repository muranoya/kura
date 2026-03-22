import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/storage_config.dart';
import 'dart:convert';

class SecureStorageService {
  static const String _storageConfigKey = 'storage_config';
  static const String _accessKeyKey = 'access_key';

  final _storage = const FlutterSecureStorage();

  /// S3設定を保存
  Future<void> saveStorageConfig(StorageConfig config) async {
    final json = config.toJson();
    await _storage.write(
      key: _storageConfigKey,
      value: jsonEncode(json),
    );
  }

  /// S3設定を読み込む
  Future<StorageConfig?> loadStorageConfig() async {
    final value = await _storage.read(key: _storageConfigKey);
    if (value == null) return null;
    final json = jsonDecode(value) as Map<String, dynamic>;
    return StorageConfig.fromJson(json);
  }

  /// Access Keyを保存（マスターパスワードで暗号化して保存）
  Future<void> saveAccessKey(String accessKey) async {
    await _storage.write(
      key: _accessKeyKey,
      value: accessKey,
    );
  }

  /// Access Keyを読み込む
  Future<String?> loadAccessKey() async {
    return await _storage.read(key: _accessKeyKey);
  }

  /// 全設定をクリア
  Future<void> clearAll() async {
    await _storage.delete(key: _storageConfigKey);
    await _storage.delete(key: _accessKeyKey);
  }
}
