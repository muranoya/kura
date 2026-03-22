import 'package:local_auth/local_auth.dart';

class BiometricsService {
  final _localAuth = LocalAuthentication();

  /// バイオメトリクスが利用可能か確認
  Future<bool> isAvailable() async {
    try {
      final isAvailable = await _localAuth.canCheckBiometrics;
      return isAvailable;
    } catch (e) {
      return false;
    }
  }

  /// バイオメトリクス認証を実行
  Future<bool> authenticate() async {
    try {
      return await _localAuth.authenticate(
        localizedReason: 'パスワードマネージャーを認証してください',
      );
    } catch (e) {
      return false;
    }
  }

  /// 利用可能なバイオメトリクスのタイプを取得
  Future<List<BiometricType>> getAvailableBiometrics() async {
    try {
      return await _localAuth.getAvailableBiometrics();
    } catch (e) {
      return [];
    }
  }
}
