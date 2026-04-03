package com.kura.app.ui.entries

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.kura.app.data.model.EntryRow
import com.kura.app.data.model.EntryType
import com.kura.app.ui.components.ConfirmDialog
import com.kura.app.ui.components.EntryCard
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryListScreen(
    appViewModel: AppViewModel,
    onEntryClick: (String) -> Unit,
    onCreateClick: () -> Unit,
    onlyFavorites: Boolean = false,
    labelId: String? = null,
    initialType: String? = null,
    onBack: (() -> Unit)? = null,
) {
    var entries by remember { mutableStateOf<List<EntryRow>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var searchQuery by remember { mutableStateOf("") }
    var selectedType by remember { mutableStateOf(initialType) }
    var deleteTargetId by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val title = when {
        onlyFavorites -> "お気に入り"
        labelId != null -> "ラベル"
        selectedType != null -> EntryType.fromValue(selectedType!!)?.displayName ?: "アイテム"
        else -> "全てのアイテム"
    }

    fun loadEntries() {
        scope.launch {
            loading = true
            try {
                entries = appViewModel.repository.listEntries(
                    searchQuery = searchQuery.ifBlank { null },
                    entryType = selectedType,
                    labelId = labelId,
                    onlyFavorites = onlyFavorites
                )
            } catch (_: Exception) { }
            loading = false
        }
    }

    LaunchedEffect(searchQuery, selectedType, labelId, onlyFavorites) {
        delay(300) // debounce
        loadEntries()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onCreateClick) {
                Icon(Icons.Default.Add, contentDescription = "新規作成")
            }
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            // Search bar
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("検索...") },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(Icons.Default.Close, contentDescription = "クリア")
                        }
                    }
                }
            )

            // Filter chips
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item {
                    FilterChip(
                        selected = selectedType == null,
                        onClick = { selectedType = null },
                        label = { Text("全て") }
                    )
                }
                items(EntryType.entries.filter { it != EntryType.PASSKEY }) { type ->
                    FilterChip(
                        selected = selectedType == type.value,
                        onClick = {
                            selectedType = if (selectedType == type.value) null else type.value
                        },
                        label = { Text(type.displayName) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            if (loading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (entries.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("アイテムがありません", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(entries, key = { it.id }) { entry ->
                        EntryCard(
                            entry = entry,
                            onClick = { onEntryClick(entry.id) },
                            onFavoriteToggle = { isFav ->
                                scope.launch {
                                    try {
                                        appViewModel.repository.setFavorite(entry.id, isFav)
                                        loadEntries()
                                    } catch (_: Exception) { }
                                }
                            },
                            onDelete = { deleteTargetId = entry.id }
                        )
                    }
                }
            }
        }
    }

    deleteTargetId?.let { targetId ->
        ConfirmDialog(
            title = "アイテムを削除",
            description = "このアイテムをゴミ箱に移動しますか？",
            confirmText = "削除",
            isDangerous = true,
            onConfirm = {
                scope.launch {
                    try {
                        appViewModel.repository.deleteEntry(targetId)
                        appViewModel.repository.saveAndPush(appViewModel.preferences.s3ConfigFlow.first())
                        loadEntries()
                    } catch (_: Exception) { }
                    deleteTargetId = null
                }
            },
            onCancel = { deleteTargetId = null }
        )
    }
}
