package com.kura.app.ui.labels

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.kura.app.data.model.Label
import com.kura.app.ui.components.ConfirmDialog
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabelManagerScreen(
    appViewModel: AppViewModel,
    onBack: () -> Unit,
    onLabelClick: (String) -> Unit
) {
    var labels by remember { mutableStateOf<List<Label>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var newLabelName by remember { mutableStateOf("") }
    var showCreateDialog by remember { mutableStateOf(false) }
    var editingLabel by remember { mutableStateOf<Label?>(null) }
    var editName by remember { mutableStateOf("") }
    var deleteTargetId by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun loadLabels() {
        scope.launch {
            loading = true
            try { labels = appViewModel.repository.listLabels() } catch (_: Exception) { }
            loading = false
        }
    }

    LaunchedEffect(Unit) { loadLabels() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ラベル管理") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
                    }
                },
                actions = {
                    IconButton(onClick = { showCreateDialog = true }) {
                        Icon(Icons.Default.Add, contentDescription = "追加")
                    }
                }
            )
        }
    ) { padding ->
        if (loading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (labels.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("ラベルがありません", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(padding)
            ) {
                items(labels, key = { it.id }) { label ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { onLabelClick(label.id) }
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Label, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(label.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                            IconButton(onClick = { editingLabel = label; editName = label.name }) {
                                Icon(Icons.Default.Edit, contentDescription = "編集")
                            }
                            IconButton(onClick = { deleteTargetId = label.id }) {
                                Icon(Icons.Default.Delete, contentDescription = "削除", tint = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
            }
        }
    }

    // Create dialog
    if (showCreateDialog) {
        AlertDialog(
            onDismissRequest = { showCreateDialog = false },
            title = { Text("ラベル作成") },
            text = {
                OutlinedTextField(
                    value = newLabelName,
                    onValueChange = { newLabelName = it },
                    label = { Text("ラベル名") },
                    singleLine = true
                )
            },
            confirmButton = {
                Button(onClick = {
                    if (newLabelName.isNotBlank()) {
                        scope.launch {
                            try {
                                appViewModel.repository.createLabel(newLabelName)
                                appViewModel.repository.saveAndPush(appViewModel.preferences.s3ConfigFlow.first())
                                newLabelName = ""
                                showCreateDialog = false
                                loadLabels()
                            } catch (_: Exception) { }
                        }
                    }
                }) { Text("作成") }
            },
            dismissButton = { TextButton(onClick = { showCreateDialog = false }) { Text("キャンセル") } }
        )
    }

    // Edit dialog
    editingLabel?.let { label ->
        AlertDialog(
            onDismissRequest = { editingLabel = null },
            title = { Text("ラベル名変更") },
            text = {
                OutlinedTextField(
                    value = editName,
                    onValueChange = { editName = it },
                    label = { Text("新しいラベル名") },
                    singleLine = true
                )
            },
            confirmButton = {
                Button(onClick = {
                    if (editName.isNotBlank()) {
                        scope.launch {
                            try {
                                appViewModel.repository.renameLabel(label.id, editName)
                                appViewModel.repository.saveAndPush(appViewModel.preferences.s3ConfigFlow.first())
                                editingLabel = null
                                loadLabels()
                            } catch (_: Exception) { }
                        }
                    }
                }) { Text("変更") }
            },
            dismissButton = { TextButton(onClick = { editingLabel = null }) { Text("キャンセル") } }
        )
    }

    // Delete dialog
    deleteTargetId?.let { targetId ->
        ConfirmDialog(
            title = "ラベル削除",
            description = "このラベルを削除しますか？",
            confirmText = "削除",
            isDangerous = true,
            onConfirm = {
                scope.launch {
                    try {
                        appViewModel.repository.deleteLabel(targetId)
                        appViewModel.repository.saveAndPush(appViewModel.preferences.s3ConfigFlow.first())
                        loadLabels()
                    } catch (_: Exception) { }
                    deleteTargetId = null
                }
            },
            onCancel = { deleteTargetId = null }
        )
    }
}
