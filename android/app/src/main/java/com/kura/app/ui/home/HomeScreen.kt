package com.kura.app.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Label
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kura.app.data.model.EntryRow
import com.kura.app.data.model.EntryType
import com.kura.app.data.model.Label
import com.kura.app.ui.components.EntryCard
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.delay
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
    var loading by remember { mutableStateOf(true) }
    var lastSyncTime by remember { mutableStateOf<Long?>(null) }
    var isSyncing by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    var showFavoritesOnly by remember { mutableStateOf(false) }
    var selectedType by remember { mutableStateOf<String?>(null) }
    var labels by remember { mutableStateOf<List<Label>>(emptyList()) }
    var selectedLabelId by remember { mutableStateOf<String?>(null) }

    // Search state
    var searchQuery by remember { mutableStateOf("") }
    var searchActive by remember { mutableStateOf(false) }
    var searchResults by remember { mutableStateOf<List<EntryRow>>(emptyList()) }
    var searchSelectedType by remember { mutableStateOf<String?>(null) }
    var searchSelectedLabelId by remember { mutableStateOf<String?>(null) }

    // Sort state
    var sortField by remember { mutableStateOf("created_at") }
    var sortOrder by remember { mutableStateOf("desc") }
    var showSortSheet by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()

    // Load preferences
    LaunchedEffect(Unit) {
        appViewModel.preferences.sortFieldFlow.collect { sortField = it }
    }
    LaunchedEffect(Unit) {
        appViewModel.preferences.sortOrderFlow.collect { sortOrder = it }
    }

    fun loadData() {
        scope.launch {
            loading = true
            try {
                allEntries = appViewModel.repository.listEntries(
                    entryType = selectedType,
                    labelId = selectedLabelId,
                    onlyFavorites = showFavoritesOnly,
                    sortField = sortField,
                    sortOrder = sortOrder
                )
                labels = appViewModel.repository.listLabels()
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
                appViewModel.backgroundSync()
                val ts = appViewModel.repository.getLastSyncTime()
                if (ts > 0) lastSyncTime = ts
            } catch (_: Exception) { }
            isSyncing = false
            loadData()
        }
    }

    val syncVersion by appViewModel.syncVersion.collectAsState()

    LaunchedEffect(Unit) {
        loadData()
    }

    // MainNavHostの自動同期完了時にデータを再読み込み
    LaunchedEffect(syncVersion) {
        if (syncVersion > 0) {
            loadData()
        }
    }

    // Reload when filters or sort change
    LaunchedEffect(selectedType, selectedLabelId, showFavoritesOnly, sortField, sortOrder) {
        if (!loading) loadData()
    }

    // Search debounce
    LaunchedEffect(searchQuery, searchSelectedType, searchSelectedLabelId) {
        delay(300)
        if (searchQuery.isNotBlank() || searchSelectedType != null || searchSelectedLabelId != null) {
            try {
                searchResults = appViewModel.repository.listEntries(
                    searchQuery = searchQuery.ifBlank { null },
                    entryType = searchSelectedType,
                    labelId = searchSelectedLabelId,
                    sortField = sortField,
                    sortOrder = sortOrder
                )
            } catch (_: Exception) { }
        } else {
            searchResults = emptyList()
        }
    }

    val displayEntries = allEntries

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
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Menu button
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surface,
                        shadowElevation = 2.dp,
                        modifier = Modifier.size(34.dp),
                        onClick = onOpenDrawer
                    ) {
                        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                            Icon(
                                Icons.Default.Menu,
                                contentDescription = "メニュー",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }

                    // Title
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            "kura",
                            style = MaterialTheme.typography.titleMedium.copy(
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

                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        // Add button
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surface,
                            shadowElevation = 2.dp,
                            modifier = Modifier.size(34.dp),
                            onClick = onCreateClick
                        ) {
                            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                                Icon(
                                    Icons.Default.Add,
                                    contentDescription = "新規作成",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }

                        // Favorites toggle
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surface,
                            shadowElevation = 2.dp,
                            modifier = Modifier.size(34.dp),
                            onClick = { showFavoritesOnly = !showFavoritesOnly }
                        ) {
                            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                                Icon(
                                    if (showFavoritesOnly) Icons.Default.Star else Icons.Outlined.StarOutline,
                                    contentDescription = "お気に入りフィルター",
                                    tint = if (showFavoritesOnly) Color(0xFFD97706) else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }

                        // Sort button
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surface,
                            shadowElevation = 2.dp,
                            modifier = Modifier.size(34.dp),
                            onClick = { showSortSheet = true }
                        ) {
                            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                                Icon(
                                    Icons.Default.SwapVert,
                                    contentDescription = "並び替え",
                                    tint = if (sortField != "created_at" || sortOrder != "desc")
                                        MaterialTheme.colorScheme.primary
                                    else
                                        MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
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
                                IconButton(onClick = { searchQuery = ""; searchSelectedType = null; searchSelectedLabelId = null }) {
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
                    .then(if (!searchActive) Modifier.padding(start = 16.dp, end = 16.dp).navigationBarsPadding() else Modifier),
                windowInsets = WindowInsets(0),
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
                        items(EntryType.entries) { type ->
                            FilterChip(
                                selected = searchSelectedType == type.value,
                                onClick = { searchSelectedType = if (searchSelectedType == type.value) null else type.value },
                                label = { Text(type.displayName) }
                            )
                        }
                    }

                    // Label filter chips in search
                    if (labels.isNotEmpty()) {
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            item {
                                Icon(
                                    Icons.AutoMirrored.Filled.Label,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            items(labels, key = { it.id }) { label ->
                                FilterChip(
                                    selected = searchSelectedLabelId == label.id,
                                    onClick = {
                                        searchSelectedLabelId = if (searchSelectedLabelId == label.id) null else label.id
                                    },
                                    label = { Text(label.name) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer,
                                        selectedLabelColor = MaterialTheme.colorScheme.onSecondaryContainer
                                    )
                                )
                            }
                        }
                    }

                    // Search results
                    val results = if (searchQuery.isNotBlank() || searchSelectedType != null || searchSelectedLabelId != null) searchResults else allEntries
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
                Column(modifier = Modifier.fillMaxSize()) {
                    // Sticky header
                    StickyHeaderContent(
                        selectedType = selectedType,
                        onTypeSelected = { selectedType = it },
                        labels = labels,
                        selectedLabelId = selectedLabelId,
                        onLabelSelected = { selectedLabelId = it }
                    )

                    // Entry list
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 80.dp)
                    ) {
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
                                        if (!showFavoritesOnly && selectedType == null && selectedLabelId == null) {
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
                                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
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

    // Sort BottomSheet
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SortBottomSheet(
    currentField: String,
    currentOrder: String,
    onSelect: (field: String, order: String) -> Unit,
    onDismiss: () -> Unit
) {
    val options = listOf(
        Triple("created_at", "desc", "作成日（新しい順）"),
        Triple("created_at", "asc", "作成日（古い順）"),
        Triple("updated_at", "desc", "更新日（新しい順）"),
        Triple("updated_at", "asc", "更新日（古い順）"),
        Triple("name", "asc", "名前（A → Z）"),
        Triple("name", "desc", "名前（Z → A）"),
    )

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(bottom = 32.dp)) {
            Text(
                "並び替え",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp)
            )
            options.forEach { (field, order, label) ->
                val isSelected = currentField == field && currentOrder == order
                ListItem(
                    headlineContent = {
                        Text(
                            label,
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                            )
                        )
                    },
                    trailingContent = {
                        if (isSelected) {
                            Icon(
                                Icons.Default.Check,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(field, order) },
                    colors = ListItemDefaults.colors(
                        containerColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f) else Color.Transparent
                    )
                )
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
            }
        }
    }
}

@Composable
private fun StickyHeaderContent(
    selectedType: String?,
    onTypeSelected: (String?) -> Unit,
    labels: List<Label>,
    selectedLabelId: String?,
    onLabelSelected: (String?) -> Unit
) {
    var labelDropdownExpanded by remember { mutableStateOf(false) }
    val selectedLabelName = labels.find { it.id == selectedLabelId }?.name

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Label dropdown button (fixed on left)
        if (labels.isNotEmpty()) {
            Box(modifier = Modifier.padding(start = 16.dp)) {
                FilterChip(
                    selected = selectedLabelId != null,
                    onClick = { labelDropdownExpanded = true },
                    label = {
                        Text(
                            selectedLabelName ?: "ラベル",
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontWeight = FontWeight.Bold
                            )
                        )
                    },
                    leadingIcon = {
                        Icon(
                            Icons.AutoMirrored.Filled.Label,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    },
                    trailingIcon = {
                        Icon(
                            if (labelDropdownExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    },
                    shape = RoundedCornerShape(20.dp),
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer,
                        selectedLabelColor = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                )
                DropdownMenu(
                    expanded = labelDropdownExpanded,
                    onDismissRequest = { labelDropdownExpanded = false }
                ) {
                    if (selectedLabelId != null) {
                        DropdownMenuItem(
                            text = { Text("クリア") },
                            onClick = {
                                onLabelSelected(null)
                                labelDropdownExpanded = false
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(18.dp))
                            }
                        )
                        HorizontalDivider()
                    }
                    labels.forEach { label ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    label.name,
                                    fontWeight = if (selectedLabelId == label.id) FontWeight.Bold else FontWeight.Normal
                                )
                            },
                            onClick = {
                                onLabelSelected(if (selectedLabelId == label.id) null else label.id)
                                labelDropdownExpanded = false
                            },
                            leadingIcon = {
                                Icon(
                                    Icons.AutoMirrored.Filled.Label,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                    tint = if (selectedLabelId == label.id)
                                        MaterialTheme.colorScheme.primary
                                    else
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        )
                    }
                }
            }
        }

        // Scrollable type filter chips
        LazyRow(
            contentPadding = PaddingValues(start = if (labels.isNotEmpty()) 7.dp else 16.dp, end = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.weight(1f)
        ) {
            item {
                FilterChip(
                    selected = selectedType == null,
                    onClick = { onTypeSelected(null) },
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
            items(EntryType.entries) { type ->
                FilterChip(
                    selected = selectedType == type.value,
                    onClick = {
                        onTypeSelected(if (selectedType == type.value) null else type.value)
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
}

