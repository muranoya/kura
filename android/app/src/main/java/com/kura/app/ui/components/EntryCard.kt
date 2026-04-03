package com.kura.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    val typeColor = entryTypeColor(entry.entryType)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
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
            // Type icon with colored background
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(13.dp))
                    .background(typeColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                EntryTypeIcon(
                    entryType = entry.entryType,
                    tint = typeColor,
                    modifier = Modifier.size(22.dp)
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = entry.name,
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                // Type badge
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(5.dp))
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
            if (onFavoriteToggle != null) {
                IconButton(
                    onClick = { onFavoriteToggle(!entry.isFavorite) },
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = if (entry.isFavorite) Icons.Default.Star else Icons.Outlined.StarOutline,
                        contentDescription = "お気に入り",
                        tint = if (entry.isFavorite) Color(0xFFD97706) else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            if (onDelete != null) {
                IconButton(onClick = onDelete, modifier = Modifier.size(36.dp)) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "削除",
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            if (onRestore != null) {
                IconButton(onClick = onRestore, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.RestoreFromTrash, contentDescription = "復元", modifier = Modifier.size(20.dp))
                }
            }
            if (onPurge != null) {
                IconButton(onClick = onPurge, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Default.DeleteForever,
                        contentDescription = "完全削除",
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}
