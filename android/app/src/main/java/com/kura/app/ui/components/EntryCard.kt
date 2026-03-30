package com.kura.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kura.app.data.model.EntryRow

@Composable
fun EntryCard(
    entry: EntryRow,
    onClick: () -> Unit,
    onFavoriteToggle: ((Boolean) -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
    // Trash mode
    onRestore: (() -> Unit)? = null,
    onPurge: (() -> Unit)? = null,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            EntryTypeIcon(
                entryType = entry.entryType,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = entry.name,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = entryTypeDisplayName(entry.entryType),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (onFavoriteToggle != null) {
                IconButton(onClick = { onFavoriteToggle(!entry.isFavorite) }) {
                    Icon(
                        imageVector = if (entry.isFavorite) Icons.Default.Star else Icons.Outlined.StarOutline,
                        contentDescription = "お気に入り",
                        tint = if (entry.isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            if (onDelete != null) {
                IconButton(onClick = onDelete) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "削除",
                        tint = MaterialTheme.colorScheme.error
                    )
                }
            }
            if (onRestore != null) {
                IconButton(onClick = onRestore) {
                    Icon(Icons.Default.RestoreFromTrash, contentDescription = "復元")
                }
            }
            if (onPurge != null) {
                IconButton(onClick = onPurge) {
                    Icon(
                        Icons.Default.DeleteForever,
                        contentDescription = "完全削除",
                        tint = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}
