// ignore_for_file: undefined_method, non_type_as_type_argument, undefined_getter
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';
import '../bridge/frb_generated.dart';

class TotpState {
  final String code;
  final int remainingSeconds;

  TotpState({
    required this.code,
    required this.remainingSeconds,
  });
}

final totpProvider =
    StreamProvider.family<TotpState, String>((ref, secret) async* {
  while (true) {
    try {
      final code = await RustLib.instance.api.apiGenerateTotpDefault(secret: secret);

      // Calculate remaining seconds (TOTP resets every 30 seconds)
      final nowSeconds = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      final remainingSeconds = 30 - (nowSeconds % 30);

      yield TotpState(code: code, remainingSeconds: remainingSeconds);

      // Wait until the next code change
      await Future.delayed(Duration(seconds: remainingSeconds));
    } catch (e) {
      // Emit error state
      await Future.delayed(const Duration(seconds: 1));
    }
  }
});
