import 'package:flutter/services.dart';
import 'dart:async';

class ClipboardService {
  Timer? _clearTimer;

  /// 値をクリップボードにコピーして、指定秒数後に自動クリア
  Future<void> copyWithTimer(String value, {int seconds = 30}) async {
    try {
      await Clipboard.setData(ClipboardData(text: value));

      // 前回のタイマーをキャンセル
      _clearTimer?.cancel();

      // 新しいタイマーを設定
      _clearTimer = Timer(Duration(seconds: seconds), () {
        _clearClipboard();
      });
    } catch (e) {
      rethrow;
    }
  }

  /// クリップボードをクリア
  Future<void> _clearClipboard() async {
    try {
      await Clipboard.setData(const ClipboardData(text: ''));
    } catch (e) {
      // Silent fail
    }
  }

  /// タイマーをキャンセル
  void cancelTimer() {
    _clearTimer?.cancel();
    _clearTimer = null;
  }

  /// リソース解放
  void dispose() {
    cancelTimer();
  }
}
