package net.meshpeak.kura.ui.credential

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Key
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import net.meshpeak.kura.R
import net.meshpeak.kura.data.model.AutofillCandidate

/** [PasskeyCreateActivity] のSelectionフェーズUI状態 */
sealed interface CreateUiState {
    data object Loading : CreateUiState
    data class Proposal(val rpDisplayName: String, val matched: AutofillCandidate) : CreateUiState
    data class Selection(val rpDisplayName: String, val candidates: List<AutofillCandidate>) : CreateUiState
    data object AlreadyRegistered : CreateUiState
}

/**
 * 新規Passkey作成時の紐付け先エントリ確認/選択画面。
 * `webauthn-passkey.md`の`CreateConfirm.tsx`と同じ情報設計（1件一致→提案、
 * 複数件→選択、いずれも「新規エントリとして保存」に切り替え可能）。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PasskeyCreateConfirmScreen(
    state: CreateUiState,
    onConfirm: (entryId: String?) -> Unit,
    onCancel: () -> Unit
) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when (state) {
            CreateUiState.Loading -> LoadingContent()
            is CreateUiState.Proposal -> ProposalContent(state, onConfirm)
            is CreateUiState.Selection -> SelectionContent(state, onConfirm)
            CreateUiState.AlreadyRegistered -> AlreadyRegisteredContent(onCancel)
        }
    }
}

@Composable
private fun LoadingContent() {
    Column(modifier = Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        // 数百ms程度で完了する想定のため簡易表示のみ（docs/android-passkey.md 6-2）
    }
}

@Composable
private fun ProposalContent(state: CreateUiState.Proposal, onConfirm: (String?) -> Unit) {
    Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        Text(stringResource(R.string.passkey_create_proposal_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            stringResource(R.string.passkey_create_proposal_message, state.rpDisplayName, state.matched.name),
            style = MaterialTheme.typography.bodyMedium
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = { onConfirm(state.matched.id) }, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.passkey_create_use_existing))
        }
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedButton(onClick = { onConfirm(null) }, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.passkey_create_new_entry))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SelectionContent(state: CreateUiState.Selection, onConfirm: (String?) -> Unit) {
    Scaffold(
        topBar = { TopAppBar(title = { Text(stringResource(R.string.passkey_create_selection_title)) }) }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            LazyColumn(modifier = Modifier.fillMaxWidth()) {
                items(state.candidates) { candidate ->
                    Card(
                        onClick = { onConfirm(candidate.id) },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
                    ) {
                        ListItem(
                            headlineContent = { Text(candidate.name) },
                            supportingContent = candidate.username?.let { { Text(it) } },
                            leadingContent = {
                                Icon(Icons.Default.Key, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            }
                        )
                    }
                }
            }
            OutlinedButton(
                onClick = { onConfirm(null) },
                modifier = Modifier.fillMaxWidth().padding(16.dp)
            ) {
                Text(stringResource(R.string.passkey_create_new_entry))
            }
        }
    }
}

@Composable
private fun AlreadyRegisteredContent(onCancel: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            Icons.Default.ErrorOutline,
            contentDescription = null,
            modifier = Modifier.padding(top = 48.dp),
            tint = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(stringResource(R.string.passkey_create_already_registered_title), style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            stringResource(R.string.passkey_create_already_registered_message),
            style = MaterialTheme.typography.bodyMedium
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.passkey_create_close))
        }
    }
}
