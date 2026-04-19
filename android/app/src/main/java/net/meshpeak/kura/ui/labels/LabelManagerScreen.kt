package net.meshpeak.kura.ui.labels

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Label
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.meshpeak.kura.R
import net.meshpeak.kura.data.model.Label
import net.meshpeak.kura.ui.components.ConfirmDialog
import net.meshpeak.kura.viewmodel.AppViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabelManagerScreen(
    appViewModel: AppViewModel,
    onOpenDrawer: () -> Unit,
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
                title = { Text(stringResource(R.string.label_manager_title)) },
                navigationIcon = {
                    IconButton(onClick = onOpenDrawer) {
                        Icon(Icons.Default.Menu, contentDescription = stringResource(R.string.cd_menu))
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showCreateDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.cd_add))
            }
        }
    ) { padding ->
        if (loading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (labels.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text(stringResource(R.string.label_manager_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(padding)
            ) {
                items(labels, key = { it.id }) { label ->
                    val labelColor = MaterialTheme.colorScheme.primary
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(onClick = { onLabelClick(label.id) }),
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surface
                        ),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp, 12.dp, 14.dp, 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(RoundedCornerShape(13.dp))
                                    .background(labelColor.copy(alpha = 0.12f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.Label,
                                    contentDescription = null,
                                    tint = labelColor,
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = label.name,
                                style = MaterialTheme.typography.bodyLarge.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp
                                ),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = { editingLabel = label; editName = label.name },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(Icons.Default.Edit, contentDescription = stringResource(R.string.cd_edit), modifier = Modifier.size(20.dp))
                            }
                            IconButton(
                                onClick = { deleteTargetId = label.id },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = stringResource(R.string.cd_delete),
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(20.dp)
                                )
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
            title = { Text(stringResource(R.string.label_manager_create_title)) },
            text = {
                OutlinedTextField(
                    value = newLabelName,
                    onValueChange = { newLabelName = it },
                    label = { Text(stringResource(R.string.label_new_name_placeholder)) },
                    singleLine = true
                )
            },
            confirmButton = {
                Button(onClick = {
                    if (newLabelName.isNotBlank()) {
                        scope.launch {
                            try {
                                appViewModel.repository.createLabel(newLabelName)
                                appViewModel.repository.saveLocally()
                                scope.launch { try { appViewModel.repository.syncInBackground(appViewModel.preferences.s3ConfigFlow.first()) } catch (_: Exception) { } }
                                newLabelName = ""
                                showCreateDialog = false
                                loadLabels()
                            } catch (_: Exception) { }
                        }
                    }
                }) { Text(stringResource(R.string.action_create)) }
            },
            dismissButton = { TextButton(onClick = { showCreateDialog = false }) { Text(stringResource(R.string.action_cancel)) } }
        )
    }

    // Edit dialog
    editingLabel?.let { label ->
        AlertDialog(
            onDismissRequest = { editingLabel = null },
            title = { Text(stringResource(R.string.label_manager_rename_title)) },
            text = {
                OutlinedTextField(
                    value = editName,
                    onValueChange = { editName = it },
                    label = { Text(stringResource(R.string.label_manager_rename_label)) },
                    singleLine = true
                )
            },
            confirmButton = {
                Button(onClick = {
                    if (editName.isNotBlank()) {
                        scope.launch {
                            try {
                                appViewModel.repository.renameLabel(label.id, editName)
                                appViewModel.repository.saveLocally()
                                scope.launch { try { appViewModel.repository.syncInBackground(appViewModel.preferences.s3ConfigFlow.first()) } catch (_: Exception) { } }
                                editingLabel = null
                                loadLabels()
                            } catch (_: Exception) { }
                        }
                    }
                }) { Text(stringResource(R.string.action_rename)) }
            },
            dismissButton = { TextButton(onClick = { editingLabel = null }) { Text(stringResource(R.string.action_cancel)) } }
        )
    }

    // Delete dialog
    deleteTargetId?.let { targetId ->
        ConfirmDialog(
            title = stringResource(R.string.label_manager_delete_title),
            description = stringResource(R.string.label_manager_delete_description),
            confirmText = stringResource(R.string.action_delete),
            isDangerous = true,
            onConfirm = {
                scope.launch {
                    try {
                        appViewModel.repository.deleteLabel(targetId)
                        appViewModel.repository.saveLocally()
                        scope.launch { try { appViewModel.repository.syncInBackground(appViewModel.preferences.s3ConfigFlow.first()) } catch (_: Exception) { } }
                        loadLabels()
                    } catch (_: Exception) { }
                    deleteTargetId = null
                }
            },
            onCancel = { deleteTargetId = null }
        )
    }
}
