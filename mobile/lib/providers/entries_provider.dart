// ignore_for_file: undefined_method, non_type_as_type_argument, undefined_getter
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../bridge/frb_generated.dart';

class EntryFilter {
  final String? searchQuery;
  final String? entryType;
  final String? labelId;
  final bool favoritesOnly;
  final bool includeDeleted;

  const EntryFilter({
    this.searchQuery,
    this.entryType,
    this.labelId,
    this.favoritesOnly = false,
    this.includeDeleted = false,
  });

  EntryFilter copyWith({
    String? searchQuery,
    String? entryType,
    String? labelId,
    bool? favoritesOnly,
    bool? includeDeleted,
  }) {
    return EntryFilter(
      searchQuery: searchQuery ?? this.searchQuery,
      entryType: entryType ?? this.entryType,
      labelId: labelId ?? this.labelId,
      favoritesOnly: favoritesOnly ?? this.favoritesOnly,
      includeDeleted: includeDeleted ?? this.includeDeleted,
    );
  }
}

final entryFilterProvider = NotifierProvider<EntryFilterNotifier, EntryFilter>(() {
  return EntryFilterNotifier();
});

class EntryFilterNotifier extends Notifier<EntryFilter> {
  @override
  EntryFilter build() {
    return const EntryFilter();
  }

  void setSearchQuery(String? query) {
    state = state.copyWith(searchQuery: query);
  }

  void setEntryType(String? type) {
    state = state.copyWith(entryType: type);
  }

  void setLabelId(String? labelId) {
    state = state.copyWith(labelId: labelId);
  }

  void toggleFavoritesOnly() {
    state = state.copyWith(favoritesOnly: !state.favoritesOnly);
  }

  void setIncludeDeleted(bool include) {
    state = state.copyWith(includeDeleted: include);
  }

  void reset() {
    state = const EntryFilter();
  }
}

final entriesProvider = FutureProvider<List<DartEntryRow>>((ref) async {
  final filter = ref.watch(entryFilterProvider);

  final allEntries = await RustLib.instance.api.apiListEntries(
    searchQuery: filter.searchQuery,
    entryType: filter.entryType,
    labelId: filter.labelId,
    includeTrash: filter.includeDeleted,
  );

  // Apply favoritesOnly filter on Dart side
  if (filter.favoritesOnly) {
    return allEntries.where((e) => e.isFavorite).toList();
  }

  return allEntries;
});
