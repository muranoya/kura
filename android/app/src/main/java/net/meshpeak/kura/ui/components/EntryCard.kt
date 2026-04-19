package net.meshpeak.kura.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.meshpeak.kura.R
import net.meshpeak.kura.data.model.EntryRow

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

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(8.dp, 8.dp, 10.dp, 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Type icon with colored background
        Box(
            modifier = Modifier
                .size(34.dp)
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
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = entry.name,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (!entry.subtitle.isNullOrEmpty()) {
                Text(
                    text = entry.subtitle,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        if (entry.isFavorite) {
            Icon(
                imageVector = Icons.Default.Star,
                contentDescription = stringResource(R.string.cd_favorite),
                tint = Color(0xFFD97706),
                modifier = Modifier.size(18.dp)
            )
        }
        if (onDelete != null) {
            IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = stringResource(R.string.cd_delete),
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
        if (onRestore != null) {
            IconButton(onClick = onRestore, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.RestoreFromTrash, contentDescription = stringResource(R.string.cd_restore), modifier = Modifier.size(18.dp))
            }
        }
        if (onPurge != null) {
            IconButton(onClick = onPurge, modifier = Modifier.size(32.dp)) {
                Icon(
                    Icons.Default.DeleteForever,
                    contentDescription = stringResource(R.string.cd_purge),
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}
