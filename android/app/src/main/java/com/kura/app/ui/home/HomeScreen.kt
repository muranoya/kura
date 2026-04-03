package com.kura.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kura.app.data.model.EntryRow
import com.kura.app.data.model.EntryType
import com.kura.app.ui.components.EntryCard
import com.kura.app.ui.components.EntryTypeIcon
import com.kura.app.ui.components.entryTypeColor
import com.kura.app.ui.components.entryTypeDisplayName
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
) {
    var allEntries by remember { mutableStateOf<List<EntryRow>>(emptyList()) }
    var favoriteEntries by remember { mutableStateOf<List<EntryRow>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var lastSyncTime by remember { mutableStateOf<Long?>(null) }
    var isSyncing by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    var showFavoritesOnly by remember { mutableStateOf(false) }
    var selectedType by remember { mutableStateOf<String?>(null) }

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

    // Filtered entries for main list
    val displayEntries = remember(allEntries, favoriteEntries, selectedType, showFavoritesOnly) {
        val source = if (showFavoritesOnly) favoriteEntries else allEntries
        if (selectedType != null) {
            source.filter { it.entryType == selectedType }
        } else {
            source
        }
    }

    Scaffold(
        topBar = {
            // Custom top bar matching mockup
            Surface(
                color = MaterialTheme.colorScheme.background,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Menu button
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surface,
                        shadowElevation = 2.dp,
                        modifier = Modifier.size(38.dp),
                        onClick = onOpenDrawer
                    ) {
                        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                            Icon(
                                Icons.Default.Menu,
                                contentDescription = "メニュー",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }

                    // Title
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            "kura",
                            style = MaterialTheme.typography.headlineSmall.copy(
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = (-0.5).sp
                            )
                        )
                        Text(
                            "VAULT",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                                letterSpacing = 2.sp,
                                fontSize = 10.sp
                            )
                        )
                    }

                    // Favorites toggle
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surface,
                        shadowElevation = 2.dp,
                        modifier = Modifier.size(38.dp),
                        onClick = { showFavoritesOnly = !showFavoritesOnly }
                    ) {
                        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                            Icon(
                                if (showFavoritesOnly) Icons.Default.Star else Icons.Outlined.StarOutline,
                                contentDescription = "お気に入りフィルター",
                                tint = if (showFavoritesOnly) Color(0xFFD97706) else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        },
        floatingActionButton = {
            if (!searchActive) {
                FloatingActionButton(
                    onClick = onCreateClick,
                    shape = RoundedCornerShape(18.dp),
                    containerColor = MaterialTheme.colorScheme.primary
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
                    // Filter chips in search
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
        } else {
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
                    contentPadding = PaddingValues(bottom = 120.dp),
                    verticalArrangement = Arrangement.spacedBy(0.dp)
                ) {
                    // Favorites section (horizontal scroll)
                    if (favoriteEntries.isNotEmpty() && !showFavoritesOnly) {
                        item {
                            Column(modifier = Modifier.padding(top = 20.dp)) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 20.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Star,
                                            contentDescription = null,
                                            modifier = Modifier.size(16.dp),
                                            tint = Color(0xFFD97706)
                                        )
                                        Text(
                                            "お気に入り",
                                            style = MaterialTheme.typography.titleSmall.copy(
                                                fontWeight = FontWeight.Bold
                                            )
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.height(12.dp))
                                LazyRow(
                                    contentPadding = PaddingValues(horizontal = 20.dp),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    items(favoriteEntries, key = { "fav_${it.id}" }) { entry ->
                                        FavoriteCard(
                                            entry = entry,
                                            onClick = { onEntryClick(entry.id) }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Filter chips
                    item {
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 20.dp),
                            horizontalArrangement = Arrangement.spacedBy(7.dp),
                            modifier = Modifier.padding(top = 18.dp)
                        ) {
                            item {
                                FilterChip(
                                    selected = selectedType == null,
                                    onClick = { selectedType = null },
                                    label = {
                                        Text(
                                            "全て",
                                            style = MaterialTheme.typography.labelMedium.copy(
                                                fontWeight = FontWeight.Bold
                                            )
                                        )
                                    },
                                    shape = RoundedCornerShape(20.dp),
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = MaterialTheme.colorScheme.primary,
                                        selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                                    )
                                )
                            }
                            items(EntryType.entries.filter { it != EntryType.PASSKEY }) { type ->
                                FilterChip(
                                    selected = selectedType == type.value,
                                    onClick = {
                                        selectedType = if (selectedType == type.value) null else type.value
                                    },
                                    label = {
                                        Text(
                                            type.displayName,
                                            style = MaterialTheme.typography.labelMedium.copy(
                                                fontWeight = FontWeight.Bold
                                            )
                                        )
                                    },
                                    shape = RoundedCornerShape(20.dp),
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = MaterialTheme.colorScheme.primary,
                                        selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                                    )
                                )
                            }
                        }
                    }

                    // Entry list
                    if (displayEntries.isEmpty()) {
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
                                        if (showFavoritesOnly) "お気に入りがありません"
                                        else "アイテムがありません",
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    if (!showFavoritesOnly && selectedType == null) {
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
                    } else {
                        items(displayEntries, key = { it.id }) { entry ->
                            Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
                                EntryCard(
                                    entry = entry,
                                    onClick = { onEntryClick(entry.id) },
                                    onFavoriteToggle = { isFav ->
                                        scope.launch {
                                            try {
                                                appViewModel.repository.setFavorite(entry.id, isFav)
                                                loadData()
                                            } catch (_: Exception) { }
                                        }
                                    }
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
private fun FavoriteCard(
    entry: EntryRow,
    onClick: () -> Unit
) {
    val typeColor = entryTypeColor(entry.entryType)

    Card(
        onClick = onClick,
        modifier = Modifier.width(118.dp),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp, 14.dp, 14.dp, 12.dp)
        ) {
            // Icon with colored background
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(typeColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                EntryTypeIcon(
                    entryType = entry.entryType,
                    tint = typeColor,
                    modifier = Modifier.size(18.dp)
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                entry.name,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(4.dp))
            // Type badge
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(typeColor.copy(alpha = 0.12f))
                    .padding(horizontal = 7.dp, vertical = 2.dp)
            ) {
                Text(
                    text = entryTypeDisplayName(entry.entryType),
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        color = typeColor
                    )
                )
            }
        }
    }
}
