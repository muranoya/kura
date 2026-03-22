// ignore_for_file: undefined_method, non_type_as_type_argument, undefined_getter
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../bridge/frb_generated.dart';

final entryDetailProvider =
    FutureProvider.family<DartEntry, String>((ref, id) async {
  return RustLib.instance.api.apiGetEntry(id: id);
});
