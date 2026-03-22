import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'providers/vault_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  runApp(
    ProviderScope(
      child: Consumer(
        builder: (context, ref, _) {
          // Trigger initialization
          Future.microtask(() async {
            await ref.read(vaultProvider.notifier).initialize();
          });

          return const KuraApp();
        },
      ),
    ),
  );
}
