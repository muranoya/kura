package net.meshpeak.kura.autofill

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import net.meshpeak.kura.R
import net.meshpeak.kura.data.model.EntryRow
import net.meshpeak.kura.data.model.EntryType
import net.meshpeak.kura.ui.components.EntryCard
import net.meshpeak.kura.ui.theme.KuraTheme
import net.meshpeak.kura.viewmodel.AppViewModel

/**
 * 手動検索フォールバック（[AutofillPickerActivity]）用の読み取り専用エントリピッカー。
 * `EntryListScreen`のUIパターン（検索バー+フィルタチップ+`LazyColumn`+`EntryCard`）を踏襲するが、
 * 削除・お気に入り・並び替え・新規作成は不要なため専用に組む。
 *
 * 手動検索はpackage_domains.json未登録のアプリにも出るため、ユーザーが入力先を確かめられるよう
 * [target]（署名検証済みブラウザのwebDomain、またはリクエスト元のパッケージ名）を表示する。
 * ネイティブアプリはパッケージ名を名乗れるだけで本物かどうか確認できないため、警告を添える。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AutofillPickerScreen(
    appViewModel: AppViewModel,
    target: String?,
    isBrowserRequest: Boolean,
    errorMessage: String?,
    onSelect: (String) -> Unit,
    onCancel: () -> Unit
) {
    var entries by remember { mutableStateOf<List<EntryRow>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var searchQuery by remember { mutableStateOf("") }
    // ログインフォームからの起動なのでLOGINタイプに絞って開始するが、
    // 「すべて」チップでいつでも解除できるようにする。
    var selectedType by remember { mutableStateOf<String?>(EntryType.LOGIN.value) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(searchQuery, selectedType) {
        delay(300) // debounce
        loading = true
        entries = try {
            appViewModel.repository.listEntries(
                searchQuery = searchQuery.ifBlank { null },
                entryType = selectedType
            )
        } catch (_: Exception) {
            emptyList()
        }
        loading = false
    }

    LaunchedEffect(errorMessage) {
        errorMessage?.let { snackbarHostState.showSnackbar(it) }
    }

    KuraTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Scaffold(
                snackbarHost = { SnackbarHost(snackbarHostState) },
                topBar = {
                    TopAppBar(
                        title = { Text(stringResource(R.string.autofill_picker_title)) },
                        navigationIcon = {
                            IconButton(onClick = onCancel) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.cd_back))
                            }
                        }
                    )
                }
            ) { padding ->
                Column(modifier = Modifier.padding(padding)) {
                    AutofillTargetBanner(target = target, isBrowserRequest = isBrowserRequest)

                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text(stringResource(R.string.home_search_placeholder)) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        singleLine = true,
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        trailingIcon = {
                            if (searchQuery.isNotEmpty()) {
                                IconButton(onClick = { searchQuery = "" }) {
                                    Icon(Icons.Default.Close, contentDescription = stringResource(R.string.cd_clear))
                                }
                            }
                        }
                    )

                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        item {
                            FilterChip(
                                selected = selectedType == null,
                                onClick = { selectedType = null },
                                label = { Text(stringResource(R.string.home_all)) }
                            )
                        }
                        items(EntryType.entries) { type ->
                            FilterChip(
                                selected = selectedType == type.value,
                                onClick = {
                                    selectedType = if (selectedType == type.value) null else type.value
                                },
                                label = { Text(stringResource(type.displayNameResId)) }
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    when {
                        loading -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                        entries.isEmpty() -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(stringResource(R.string.entry_list_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        else -> LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp)) {
                            items(entries, key = { it.id }) { entry ->
                                EntryCard(entry = entry, onClick = { onSelect(entry.id) })
                                HorizontalDivider(
                                    thickness = 0.5.dp,
                                    color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AutofillTargetBanner(target: String?, isBrowserRequest: Boolean) {
    // 署名検証済みブラウザ以外（ネイティブアプリ・入力先不明）は警告色にする
    val verified = isBrowserRequest && target != null
    val containerColor = if (verified) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.errorContainer
    val contentColor = if (verified) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onErrorContainer
    Surface(
        color = containerColor,
        contentColor = contentColor,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = when {
                    target == null -> stringResource(R.string.autofill_picker_target_unknown)
                    isBrowserRequest -> stringResource(R.string.autofill_picker_target_web, target)
                    else -> stringResource(R.string.autofill_picker_target_app, target)
                },
                style = MaterialTheme.typography.titleSmall
            )
            if (!verified) {
                Text(
                    text = stringResource(R.string.autofill_picker_target_app_warning),
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}
