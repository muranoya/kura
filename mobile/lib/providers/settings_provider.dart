import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/app_settings.dart';
import '../services/secure_storage_service.dart';
import 'dart:convert';

final secureStorageServiceProvider = Provider((ref) => SecureStorageService());

final settingsProvider = NotifierProvider<SettingsNotifier, AppSettings>(() {
  return SettingsNotifier();
});

class SettingsNotifier extends Notifier<AppSettings> {
  static const String _settingsKey = 'app_settings';

  @override
  AppSettings build() {
    // Initialize with defaults (will be loaded in initiate)
    return AppSettings.defaults();
  }

  /// 設定を読み込む
  Future<void> loadSettings() async {
    try {
      final service = ref.watch(secureStorageServiceProvider);
      final settingsJson = await _loadFromPreferences();

      if (settingsJson != null) {
        state = AppSettings.fromJson(jsonDecode(settingsJson));
      } else {
        state = AppSettings.defaults();
      }
    } catch (e) {
      state = AppSettings.defaults();
    }
  }

  /// クリップボード自動クリアまでの時間を設定
  Future<void> setClipboardClearSeconds(int seconds) async {
    final newSettings = state.copyWith(clipboardClearSeconds: seconds);
    state = newSettings;
    await _saveSettings(newSettings);
  }

  /// オートロック時間を設定
  Future<void> setAutoLockSeconds(int seconds) async {
    final newSettings = state.copyWith(autoLockSeconds: seconds);
    state = newSettings;
    await _saveSettings(newSettings);
  }

  /// バイオメトリクス認証を有効化
  Future<void> setEnableBiometrics(bool enabled) async {
    final newSettings = state.copyWith(enableBiometrics: enabled);
    state = newSettings;
    await _saveSettings(newSettings);
  }

  /// プライベートモードを設定
  Future<void> setPrivateMode(bool enabled) async {
    final newSettings = state.copyWith(privateMode: enabled);
    state = newSettings;
    await _saveSettings(newSettings);
  }

  /// 設定を保存
  Future<void> _saveSettings(AppSettings settings) async {
    try {
      await _saveToPreferences(jsonEncode(settings.toJson()));
    } catch (e) {
      // Silent fail - settings should be in memory
    }
  }

  /// SharedPreferencesから読み込み（簡易実装）
  Future<String?> _loadFromPreferences() async {
    // TODO: Use shared_preferences package for persistence
    return null;
  }

  /// SharedPreferencesに保存（簡易実装）
  Future<void> _saveToPreferences(String json) async {
    // TODO: Use shared_preferences package for persistence
  }
}
