import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/vault_provider.dart';
import '../screens/onboarding/welcome_screen.dart';
import '../screens/onboarding/storage_setup_screen.dart';
import '../screens/onboarding/master_password_screen.dart';
import '../screens/onboarding/recovery_key_screen.dart';
import '../screens/auth/lock_screen.dart';
import '../screens/auth/recovery_auth_screen.dart';
import '../screens/entries/entry_list_screen.dart';
import '../screens/entries/entry_detail_screen.dart';
import '../screens/entries/entry_create_screen.dart';
import '../screens/entries/entry_edit_screen.dart';
import '../screens/entries/trash_screen.dart';
import '../screens/sync/sync_status_screen.dart';
import '../screens/sync/conflict_resolve_screen.dart';
import '../screens/labels/label_manage_screen.dart';
import '../screens/settings/settings_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final vaultState = ref.watch(vaultProvider);

  return GoRouter(
    redirect: (context, state) {
      final isOnboarding = state.matchedLocation.startsWith('/onboarding');
      final isAuth = state.matchedLocation.startsWith('/auth');

      switch (vaultState.status) {
        case VaultStatus.uninitialized:
          if (!isOnboarding) {
            return '/onboarding/welcome';
          }
          return null;

        case VaultStatus.locked:
          if (!isAuth && !isOnboarding) {
            return '/auth/lock';
          }
          return null;

        case VaultStatus.unlocking:
        case VaultStatus.unlocked:
          if (isOnboarding || isAuth) {
            return '/entries';
          }
          return null;

        case VaultStatus.error:
          return null;
      }
      return null;
    },
    routes: [
      // Onboarding routes
      GoRoute(
        path: '/onboarding/welcome',
        builder: (context, state) => const WelcomeScreen(),
      ),
      GoRoute(
        path: '/onboarding/storage-setup',
        builder: (context, state) => const StorageSetupScreen(),
      ),
      GoRoute(
        path: '/onboarding/master-password',
        builder: (context, state) => const MasterPasswordScreen(),
      ),
      GoRoute(
        path: '/onboarding/recovery-key',
        builder: (context, state) => RecoveryKeyScreen(
          recoveryKey: state.extra as String? ?? '',
        ),
      ),

      // Auth routes
      GoRoute(
        path: '/auth/lock',
        builder: (context, state) => const LockScreen(),
      ),
      GoRoute(
        path: '/recovery-auth',
        builder: (context, state) => const RecoveryAuthScreen(),
      ),

      // Main routes
      GoRoute(
        path: '/entries',
        builder: (context, state) => const EntryListScreen(),
      ),
      GoRoute(
        path: '/entries/create',
        builder: (context, state) => const EntryCreateScreen(),
      ),
      GoRoute(
        path: '/entries/create/:type',
        builder: (context, state) {
          final type = state.pathParameters['type'] ?? 'login';
          return const _PlaceholderScreen('Create Entry');
          // TODO: Implement type-specific entry creation form
        },
      ),
      GoRoute(
        path: '/entries/:id',
        builder: (context, state) => EntryDetailScreen(
          entryId: state.pathParameters['id'] ?? '',
        ),
      ),
      GoRoute(
        path: '/entries/:id/edit',
        builder: (context, state) => EntryEditScreen(
          entryId: state.pathParameters['id'] ?? '',
        ),
      ),
      GoRoute(
        path: '/trash',
        builder: (context, state) => const TrashScreen(),
      ),

      // Sync routes
      GoRoute(
        path: '/sync',
        builder: (context, state) => const SyncStatusScreen(),
      ),
      GoRoute(
        path: '/sync/conflicts',
        builder: (context, state) => ConflictResolveScreen(
          conflicts: state.extra as List? ?? [],
        ),
      ),

      // Labels
      GoRoute(
        path: '/labels',
        builder: (context, state) => const LabelManageScreen(),
      ),

      // Settings
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
    ],
  );
});

class _PlaceholderScreen extends StatelessWidget {
  final String title;

  const _PlaceholderScreen(this.title);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text('$title Screen')),
    );
  }
}
