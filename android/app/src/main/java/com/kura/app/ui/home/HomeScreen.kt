package com.kura.app.ui.home

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kura.app.data.model.EntryRow
import com.kura.app.data.model.EntryType
import com.kura.app.ui.components.EntryCard
import com.kura.app.ui.components.EntryTypeIcon
import com.kura.app.ui.components.entryTypeDisplayName
import com.kura.app.ui.sync.formatRelativeTime
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    appViewModel: AppViewModel,
    onOpenDrawer: () -> Unit,
    onEntryClick: (String) -> Unit,
    onCreateClick: () -> Unit,
    onCategoryClick: (String) -> Unit,
    onShowAllFavorites: () -> Unit,
    onShowAllEntries: () -> Unit
) {
    var allEntries by remember { mutableStateOf<List<EntryRow>>(emptyList()) }
    var favoriteEntries by remember { mutableStateOf<List<EntryRow>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var lastSyncTime by remember { mutableStateOf<Long?>(null) }
    var isSyncing by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    var showFavoritesOnly by remember { mutableStateOf(false) }

    // Search state
    var searchQuery by remember { mutableStateOf("") }
    var searchActive by remember { mutableStateOf(false) }
    var searchResults by remember { mutableStateOf<List<EntryRow>>(emptyList()) }
    var searchSelectedType by remember { mutableStateOf<String?>(null) }

    val scope = rememberCoroutineScope()

    fun loadData() {
        scope.launch {
            loading = true
            try {
                allEntries = appViewModel.repository.listEntries()
                favoriteEntries = appViewModel.repository.listEntries(onlyFavorites = true)
                val ts = appViewModel.repository.getLastSyncTime()
                if (ts > 0) lastSyncTime = ts
            } catch (_: Exception) { }
            loading = false
        }
    }

    fun performSync() {
        scope.launch {
            isSyncing = true
            try {
                val config = appViewModel.preferences.s3ConfigFlow.first()
                if (config != null) {
                    val result = appViewModel.repository.syncVault(config)
                    if (result.synced) {
                        val vaultBytes = appViewModel.repository.getVaultBytes()
                        appViewModel.repository.writeVaultFile(vaultBytes)
                        if (result.lastSyncedAt != null) {
                            appViewModel.preferences.saveLastSyncTime(result.lastSyncedAt)
                            lastSyncTime = result.lastSyncedAt
                        }
                    }
                }
            } catch (_: Exception) { }
            isSyncing = false
            loadData()
        }
    }

    LaunchedEffect(Unit) { loadData() }

    // Search debounce
    LaunchedEffect(searchQuery, searchSelectedType) {
        delay(300)
        if (searchQuery.isNotBlank() || searchSelectedType != null) {
            try {
                searchResults = appViewModel.repository.listEntries(
                    searchQuery = searchQuery.ifBlank { null },
                    entryType = searchSelectedType
                )
            } catch (_: Exception) { }
        } else {
            searchResults = emptyList()
        }
    }

    // Category counts
    val categoryCounts = remember(allEntries) {
        val counts = allEntries.groupBy { it.entryType }.mapValues { it.value.size }
        EntryType.entries.filter { it != EntryType.PASSKEY }.map { type ->
            type to (counts[type.value] ?: 0)
        }
    }

    // Recent entries
    val recentEntries = remember(allEntries) {
        allEntries.sortedByDescending { it.updatedAt }.take(10)
    }

    // Entries to display when favorite filter is on
    val displayEntries = if (showFavoritesOnly) favoriteEntries else allEntries

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onOpenDrawer) {
                        Icon(Icons.Default.Menu, contentDescription = "メニュー")
                    }
                },
                title = { Text("kura") },
                actions = {
                    // Sync indicator
                    if (isSyncing) {
                        Box(modifier = Modifier.padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        }
                    } else {
                        TextButton(onClick = { performSync() }) {
                            Icon(Icons.Default.Sync, contentDescription = "同期", modifier = Modifier.size(18.dp))
                            if (lastSyncTime != null) {
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    formatRelativeTime(lastSyncTime!!),
                                    style = MaterialTheme.typography.labelSmall
                                )
                            }
                        }
                    }
                    // Favorite filter toggle
                    IconButton(onClick = { showFavoritesOnly = !showFavoritesOnly }) {
                        Icon(
                            if (showFavoritesOnly) Icons.Default.Star else Icons.Outlined.StarOutline,
                            contentDescription = "お気に入りフィルター",
                            tint = if (showFavoritesOnly) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            )
        },
        floatingActionButton = {
            if (!searchActive) {
                FloatingActionButton(
                    onClick = onCreateClick,
                    modifier = Modifier.padding(bottom = 56.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = "新規作成")
                }
            }
        },
        bottomBar = {
            SearchBar(
                inputField = {
                    SearchBarDefaults.InputField(
                        query = searchQuery,
                        onQueryChange = { searchQuery = it },
                        onSearch = { },
                        expanded = searchActive,
                        onExpandedChange = { searchActive = it },
                        placeholder = { Text("アイテムを検索...") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        trailingIcon = {
                            if (searchQuery.isNotEmpty()) {
                                IconButton(onClick = { searchQuery = ""; searchSelectedType = null }) {
                                    Icon(Icons.Default.Close, contentDescription = "クリア")
                                }
                            }
                        }
                    )
                },
                expanded = searchActive,
                onExpandedChange = { searchActive = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (!searchActive) Modifier.padding(horizontal = 16.dp, vertical = 8.dp) else Modifier),
            ) {
                // Search expanded content
                Column {
                    // Filter chips
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        item {
                            FilterChip(
                                selected = searchSelectedType == null,
                                onClick = { searchSelectedType = null },
                                label = { Text("全て") }
                            )
                        }
                        items(EntryType.entries.filter { it != EntryType.PASSKEY }) { type ->
                            FilterChip(
                                selected = searchSelectedType == type.value,
                                onClick = { searchSelectedType = if (searchSelectedType == type.value) null else type.value },
                                label = { Text(type.displayName) }
                            )
                        }
                    }

                    // Search results
                    val results = if (searchQuery.isNotBlank() || searchSelectedType != null) searchResults else allEntries
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(results, key = { it.id }) { entry ->
                            EntryCard(
                                entry = entry,
                                onClick = {
                                    onEntryClick(entry.id)
                                    searchActive = false
                                }
                            )
                        }
                        if (results.isEmpty()) {
                            item {
                                Box(
                                    modifier = Modifier.fillMaxWidth().padding(32.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text("アイテムが見つかりません", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    ) { padding ->
        if (loading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (showFavoritesOnly) {
            // Favorites-only mode: show flat list
            PullToRefreshBox(
                isRefreshing = isRefreshing,
                onRefresh = {
                    isRefreshing = true
                    scope.launch {
                        performSync()
                        isRefreshing = false
                    }
                },
                modifier = Modifier.padding(padding)
            ) {
                if (favoriteEntries.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("お気に入りがありません", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(favoriteEntries, key = { it.id }) { entry ->
                            EntryCard(
                                entry = entry,
                                onClick = { onEntryClick(entry.id) }
                            )
                        }
                    }
                }
            }
        } else {
            // Home dashboard mode
            PullToRefreshBox(
                isRefreshing = isRefreshing,
                onRefresh = {
                    isRefreshing = true
                    scope.launch {
                        performSync()
                        isRefreshing = false
                    }
                },
                modifier = Modifier.padding(padding)
            ) {
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Favorites section
                    if (favoriteEntries.isNotEmpty()) {
                        item {
                            SectionHeader(
                                title = "お気に入り",
                                icon = Icons.Default.Star,
                                actionText = "すべて",
                                onAction = onShowAllFavorites
                            )
                        }
                        item {
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(favoriteEntries, key = { it.id }) { entry ->
                                    FavoriteCard(
                                        entry = entry,
                                        onClick = { onEntryClick(entry.id) }
                                    )
                                }
                            }
                        }
                    }

                    // Category section
                    item {
                        SectionHeader(title = "カテゴリ", icon = Icons.Default.Category)
                    }
                    // 2-column grid using FlowRow
                    item {
                        CategoryGrid(
                            categories = categoryCounts,
                            onCategoryClick = onCategoryClick
                        )
                    }

                    // Recent section
                    if (recentEntries.isNotEmpty()) {
                        item {
                            SectionHeader(
                                title = "最近の更新",
                                icon = Icons.Default.History,
                                actionText = "すべて",
                                onAction = onShowAllEntries
                            )
                        }
                        items(recentEntries, key = { "recent_${it.id}" }) { entry ->
                            EntryCard(
                                entry = entry,
                                onClick = { onEntryClick(entry.id) }
                            )
                        }
                    }

                    // Empty state
                    if (allEntries.isEmpty()) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(32.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Icon(
                                        Icons.Default.Key,
                                        contentDescription = null,
                                        modifier = Modifier.size(48.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Spacer(modifier = Modifier.height(16.dp))
                                    Text(
                                        "アイテムがありません",
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        "右下の + ボタンで新しいアイテムを作成できます",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    actionText: String? = null,
    onAction: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.weight(1f)
        )
        if (actionText != null && onAction != null) {
            TextButton(onClick = onAction) {
                Text(actionText, style = MaterialTheme.typography.labelMedium)
                Spacer(modifier = Modifier.width(4.dp))
                Icon(Icons.Default.ChevronRight, contentDescription = null, modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun FavoriteCard(
    entry: EntryRow,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.width(140.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
        )
    ) {
        Column(
            modifier = Modifier.padding(12.dp)
        ) {
            EntryTypeIcon(
                entryType = entry.entryType,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                entry.name,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                entryTypeDisplayName(entry.entryType),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CategoryGrid(
    categories: List<Pair<EntryType, Int>>,
    onCategoryClick: (String) -> Unit
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        maxItemsInEachRow = 2
    ) {
        categories.forEach { (type, count) ->
            Card(
                onClick = { onCategoryClick(type.value) },
                modifier = Modifier.weight(1f),
                colors = CardDefaults.cardColors(
                    containerColor = if (count > 0)
                        MaterialTheme.colorScheme.surfaceContainerHigh
                    else
                        MaterialTheme.colorScheme.surfaceContainerLow
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    EntryTypeIcon(
                        entryType = type.value,
                        tint = if (count > 0)
                            MaterialTheme.colorScheme.primary
                        else
                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            type.displayName,
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (count > 0)
                                MaterialTheme.colorScheme.onSurface
                            else
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                        )
                        Text(
                            "${count}件",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
