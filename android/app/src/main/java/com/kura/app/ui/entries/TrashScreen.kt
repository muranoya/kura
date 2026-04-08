package com.kura.app.ui.entries

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.kura.app.data.model.EntryRow
import com.kura.app.ui.components.ConfirmDialog
import com.kura.app.ui.components.EntryCard
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrashScreen(
    appViewModel: AppViewModel,
    onOpenDrawer: () -> Unit
) {
    var entries by remember { mutableStateOf<List<EntryRow>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var purgeTargetId by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun loadEntries() {
        scope.launch {
            loading = true
            try {
                entries = appViewModel.repository.listEntries(includeTrash = true)
                    .filter { it.deletedAt != null }
            } catch (_: Exception) { }
            loading = false
        }
    }

    LaunchedEffect(Unit) { loadEntries() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ゴミ箱") },
                navigationIcon = {
                    IconButton(onClick = onOpenDrawer) {
                        Icon(Icons.Default.Menu, contentDescription = "メニュー")
                    }
                }
            )
        }
    ) { padding ->
        if (loading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (entries.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("ゴミ箱は空です", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(padding)
            ) {
                items(entries, key = { it.id }) { entry ->
                    EntryCard(
                        entry = entry,
                        onClick = { },
                        onRestore = {
                            scope.launch {
                                try {
                                    appViewModel.repository.restoreEntry(entry.id)
                                    appViewModel.repository.saveLocally()
                                    scope.launch { try { appViewModel.repository.syncInBackground(appViewModel.preferences.s3ConfigFlow.first()) } catch (_: Exception) { } }
                                    loadEntries()
                                } catch (_: Exception) { }
                            }
                        },
                        onPurge = { purgeTargetId = entry.id }
                    )
                }
            }
        }
    }

    purgeTargetId?.let { targetId ->
        ConfirmDialog(
            title = "完全削除",
            description = "このアイテムを完全に削除しますか？この操作は取り消せません。",
            confirmText = "完全削除",
            isDangerous = true,
            onConfirm = {
                scope.launch {
                    try {
                        appViewModel.repository.purgeEntry(targetId)
                        appViewModel.repository.saveLocally()
                        scope.launch { try { appViewModel.repository.syncInBackground(appViewModel.preferences.s3ConfigFlow.first()) } catch (_: Exception) { } }
                        loadEntries()
                    } catch (_: Exception) { }
                    purgeTargetId = null
                }
            },
            onCancel = { purgeTargetId = null }
        )
    }
}
