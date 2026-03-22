class AppSettings {
  final int clipboardClearSeconds;
  final int autoLockSeconds;
  final bool enableBiometrics;
  final bool privateMode;

  const AppSettings({
    this.clipboardClearSeconds = 30,
    this.autoLockSeconds = 300,
    this.enableBiometrics = false,
    this.privateMode = false,
  });

  factory AppSettings.defaults() {
    return const AppSettings();
  }

  factory AppSettings.fromJson(Map<String, dynamic> json) {
    return AppSettings(
      clipboardClearSeconds: json['clipboardClearSeconds'] as int? ?? 30,
      autoLockSeconds: json['autoLockSeconds'] as int? ?? 300,
      enableBiometrics: json['enableBiometrics'] as bool? ?? false,
      privateMode: json['privateMode'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'clipboardClearSeconds': clipboardClearSeconds,
      'autoLockSeconds': autoLockSeconds,
      'enableBiometrics': enableBiometrics,
      'privateMode': privateMode,
    };
  }

  AppSettings copyWith({
    int? clipboardClearSeconds,
    int? autoLockSeconds,
    bool? enableBiometrics,
    bool? privateMode,
  }) {
    return AppSettings(
      clipboardClearSeconds: clipboardClearSeconds ?? this.clipboardClearSeconds,
      autoLockSeconds: autoLockSeconds ?? this.autoLockSeconds,
      enableBiometrics: enableBiometrics ?? this.enableBiometrics,
      privateMode: privateMode ?? this.privateMode,
    );
  }
}
