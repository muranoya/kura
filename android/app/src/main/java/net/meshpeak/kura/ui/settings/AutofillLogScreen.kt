package net.meshpeak.kura.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.meshpeak.kura.R
import net.meshpeak.kura.autofill.log.AutofillLogEntry
import net.meshpeak.kura.autofill.log.AutofillLogStore
import net.meshpeak.kura.ui.components.ConfirmDialog

/**
 * オートフィルの直近の動作結果（フィールド検出/ドメイン解決/マッチ件数等）を閲覧する画面。
 * `EntryListScreen`のTopAppBar+LazyColumn構成を踏襲する。秘匿値は表示対象に含まれない
 * （[AutofillLogStore]が構造的に保持していないため）。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AutofillLogScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var logs by remember { mutableStateOf<List<AutofillLogEntry>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var showClearConfirm by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun reload() {
        scope.launch {
            loading = true
            logs = withContext(Dispatchers.IO) { AutofillLogStore.list(context) }
            loading = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.autofill_log_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.cd_back))
                    }
                },
                actions = {
                    IconButton(onClick = { showClearConfirm = true }, enabled = logs.isNotEmpty()) {
                        Icon(Icons.Default.DeleteSweep, contentDescription = stringResource(R.string.autofill_log_clear_action))
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                logs.isEmpty() -> Text(
                    stringResource(R.string.autofill_log_empty),
                    modifier = Modifier.align(Alignment.Center),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                else -> LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                    items(logs, key = { it.id }) { log ->
                        AutofillLogRow(log)
                        HorizontalDivider(
                            thickness = 0.5.dp,
                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                        )
                    }
                }
            }
        }
    }

    if (showClearConfirm) {
        ConfirmDialog(
            title = stringResource(R.string.autofill_log_clear_title),
            description = stringResource(R.string.autofill_log_clear_description),
            confirmText = stringResource(R.string.action_delete),
            isDangerous = true,
            onConfirm = {
                showClearConfirm = false
                scope.launch {
                    withContext(Dispatchers.IO) { AutofillLogStore.clearAll(context) }
                    reload()
                }
            },
            onCancel = { showClearConfirm = false }
        )
    }
}

@Composable
private fun AutofillLogRow(log: AutofillLogEntry) {
    val candidateCountLabel = if (log.candidateCount > 0) {
        stringResource(R.string.autofill_log_candidate_count, log.candidateCount)
    } else {
        null
    }
    val detailLine = listOfNotNull(log.detectedFields, candidateCountLabel).joinToString(" · ")

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                log.target ?: stringResource(R.string.autofill_log_target_unknown),
                fontWeight = FontWeight.Medium
            )
            Text(
                formatRelativeTime(log.timestampMillis),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Text(
            stringResource(log.outcome.labelResId),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (detailLine.isNotEmpty()) {
            Text(
                detailLine,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        log.errorClass?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun formatRelativeTime(timestampMillis: Long): String {
    val diffSeconds = (System.currentTimeMillis() - timestampMillis) / 1000
    return when {
        diffSeconds < 60 -> stringResource(R.string.time_just_now)
        diffSeconds < 3600 -> stringResource(R.string.time_minutes_ago, (diffSeconds / 60).toInt())
        diffSeconds < 86400 -> stringResource(R.string.time_hours_ago, (diffSeconds / 3600).toInt())
        else -> stringResource(R.string.time_days_ago, (diffSeconds / 86400).toInt())
    }
}
