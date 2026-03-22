import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/totp_provider.dart';
import '../common/copy_button.dart';

class TotpDisplay extends ConsumerWidget {
  final String secret;

  const TotpDisplay({
    Key? key,
    required this.secret,
  }) : super(key: key);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final totpAsync = ref.watch(totpProvider(secret));

    return totpAsync.when(
      data: (totpState) => Column(
        children: [
          Row(
            children: [
              Text(
                totpState.code,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  fontFamily: 'monospace',
                ),
              ),
              const SizedBox(width: 8),
              CopyButton(value: totpState.code),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: totpState.remainingSeconds / 30,
              minHeight: 4,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${totpState.remainingSeconds}秒',
            style: Theme.of(context).textTheme.caption,
          ),
        ],
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Text('TOTP生成エラー: $error'),
    );
  }
}
