package net.meshpeak.kura.ui.entries

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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import net.meshpeak.kura.R
import net.meshpeak.kura.data.model.EntryRow
import net.meshpeak.kura.data.model.EntryType
import net.meshpeak.kura.ui.components.ConfirmDialog
import net.meshpeak.kura.ui.components.EntryCard
import net.meshpeak.kura.ui.home.SortBottomSheet
import net.meshpeak.kura.viewmodel.AppViewModel
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
    var sortField by remember { mutableStateOf("created_at") }
    var sortOrder by remember { mutableStateOf("desc") }
    var showSortSheet by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // Load sort preferences
    LaunchedEffect(Unit) {
        appViewModel.preferences.sortFieldFlow.collect { sortField = it }
    }
    LaunchedEffect(Unit) {
        appViewModel.preferences.sortOrderFlow.collect { sortOrder = it }
    }

    val title = when {
        onlyFavorites -> stringResource(R.string.entry_list_favorites)
        labelId != null -> stringResource(R.string.entry_list_by_label)
        selectedType != null -> EntryType.fromValue(selectedType!!)
            ?.let { stringResource(it.displayNameResId) }
            ?: stringResource(R.string.entry_list_items)
        else -> stringResource(R.string.entry_list_all_items)
    }

    fun loadEntries() {
        scope.launch {
            try {
                entries = appViewModel.repository.listEntries(
                    searchQuery = searchQuery.ifBlank { null },
                    entryType = selectedType,
                    labelId = labelId,
                    onlyFavorites = onlyFavorites,
                    sortField = sortField,
                    sortOrder = sortOrder
                )
            } catch (_: Exception) { }
            loading = false
        }
    }

    LaunchedEffect(searchQuery, selectedType, labelId, onlyFavorites, sortField, sortOrder) {
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
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.cd_back))
                        }
                    }
                },
                actions = {
                    IconButton(onClick = { showSortSheet = true }) {
                        Icon(
                            Icons.Default.SwapVert,
                            contentDescription = stringResource(R.string.action_sort),
                            tint = if (sortField != "created_at" || sortOrder != "desc")
                                MaterialTheme.colorScheme.primary
                            else
                                MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onCreateClick) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.action_new))
            }
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            // Search bar
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

            // Filter chips
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

            if (loading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (entries.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.entry_list_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = 16.dp)
                ) {
                    items(entries, key = { it.id }) { entry ->
                        EntryCard(
                            entry = entry,
                            onClick = { onEntryClick(entry.id) },
                            onFavoriteToggle = { isFav ->
                                scope.launch {
                                    try {
                                        appViewModel.repository.setFavorite(entry.id, isFav)
                                        appViewModel.repository.saveLocally()
                                        scope.launch { try { appViewModel.repository.syncInBackground(appViewModel.preferences.s3ConfigFlow.first()) } catch (_: Exception) { } }
                                        loadEntries()
                                    } catch (_: Exception) { }
                                }
                            },
                            onDelete = { deleteTargetId = entry.id }
                        )
                        HorizontalDivider(
                            thickness = 0.5.dp,
                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                        )
                    }
                }
            }
        }
    }

    deleteTargetId?.let { targetId ->
        ConfirmDialog(
            title = stringResource(R.string.entry_list_delete_title),
            description = stringResource(R.string.entry_list_delete_description),
            confirmText = stringResource(R.string.action_delete),
            isDangerous = true,
            onConfirm = {
                scope.launch {
                    try {
                        appViewModel.repository.deleteEntry(targetId)
                        appViewModel.repository.saveLocally()
                        scope.launch { try { appViewModel.repository.syncInBackground(appViewModel.preferences.s3ConfigFlow.first()) } catch (_: Exception) { } }
                        loadEntries()
                    } catch (_: Exception) { }
                    deleteTargetId = null
                }
            },
            onCancel = { deleteTargetId = null }
        )
    }

    if (showSortSheet) {
        SortBottomSheet(
            currentField = sortField,
            currentOrder = sortOrder,
            onSelect = { field, order ->
                sortField = field
                sortOrder = order
                showSortSheet = false
                scope.launch {
                    appViewModel.preferences.saveSortConfig(field, order)
                }
            },
            onDismiss = { showSortSheet = false }
        )
    }
}
