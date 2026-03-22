import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.lock, size: 80),
              const SizedBox(height: 24),
              Text(
                'kura',
                style: Theme.of(context).textTheme.displayLarge,
              ),
              const SizedBox(height: 12),
              Text(
                'サーバ不要、自分一人のための\nパスワードマネージャー',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 48),
              ElevatedButton(
                onPressed: () => context.go('/onboarding/storage-setup'),
                child: const Text('新規作成'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => context.go('/onboarding/storage-setup'),
                child: const Text('既存のVaultを復元'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
