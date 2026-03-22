import 'dart:io';
import 'package:path_provider/path_provider.dart';

class LocalCacheService {
  static const String _vaultFileName = 'vault.json';
  static const String _etagFileName = 'etag.txt';

  Future<Directory> _getVaultDirectory() async {
    final appDir = await getApplicationDocumentsDirectory();
    final vaultDir = Directory('${appDir.path}/kura');
    if (!await vaultDir.exists()) {
      await vaultDir.create(recursive: true);
    }
    return vaultDir;
  }

  Future<File> _getVaultFile() async {
    final dir = await _getVaultDirectory();
    return File('${dir.path}/$_vaultFileName');
  }

  Future<File> _getEtagFile() async {
    final dir = await _getVaultDirectory();
    return File('${dir.path}/$_etagFileName');
  }

  /// ローカルキャッシュからVaultバイナリを読み込む
  Future<List<int>?> loadVaultBytes() async {
    try {
      final file = await _getVaultFile();
      if (await file.exists()) {
        return await file.readAsBytes();
      }
      return null;
    } catch (e) {
      rethrow;
    }
  }

  /// Vaultバイナリをローカルキャッシュに保存
  Future<void> saveVaultBytes(List<int> bytes) async {
    try {
      final file = await _getVaultFile();
      await file.writeAsBytes(bytes);
    } catch (e) {
      rethrow;
    }
  }

  /// ETagを読み込む
  Future<String?> loadEtag() async {
    try {
      final file = await _getEtagFile();
      if (await file.exists()) {
        return await file.readAsString();
      }
      return null;
    } catch (e) {
      rethrow;
    }
  }

  /// ETagを保存
  Future<void> saveEtag(String etag) async {
    try {
      final file = await _getEtagFile();
      await file.writeAsString(etag);
    } catch (e) {
      rethrow;
    }
  }

  /// ローカルキャッシュを削除
  Future<void> clearCache() async {
    try {
      final vaultFile = await _getVaultFile();
      final etagFile = await _getEtagFile();

      if (await vaultFile.exists()) {
        await vaultFile.delete();
      }
      if (await etagFile.exists()) {
        await etagFile.delete();
      }
    } catch (e) {
      rethrow;
    }
  }
}
