import 'dart:async';

enum AppLifecycleState { paused, resumed }

class AutoLockService {
  Timer? _inactivityTimer;
  int _timeoutSeconds = 300; // デフォルト5分
  final _lockController = StreamController<void>.broadcast();

  /// ユーザーインタラクション時に呼び出し
  void onUserInteraction() {
    _resetTimer();
  }

  /// アプリがバックグラウンドに移行時
  void onAppPaused() {
    _lock();
  }

  /// アプリがフォアグラウンドに復帰時
  void onAppResumed() {
    _resetTimer();
  }

  /// ロックタイムアウトを設定（秒）
  void setTimeoutSeconds(int seconds) {
    _timeoutSeconds = seconds;
    _resetTimer();
  }

  /// ロックイベントのストリーム
  Stream<void> get lockEvents => _lockController.stream;

  /// タイマーをリセット
  void _resetTimer() {
    _inactivityTimer?.cancel();
    _inactivityTimer = Timer(Duration(seconds: _timeoutSeconds), _lock);
  }

  /// ロックイベントを発火
  void _lock() {
    _inactivityTimer?.cancel();
    _lockController.add(null);
  }

  /// リソース解放
  void dispose() {
    _inactivityTimer?.cancel();
    _lockController.close();
  }
}
