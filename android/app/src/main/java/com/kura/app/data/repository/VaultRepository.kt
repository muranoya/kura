package com.kura.app.data.repository

import android.content.Context
import com.kura.app.bridge.VaultBridge
import com.kura.app.data.model.*
import com.kura.app.data.s3.ConflictException
import com.kura.app.data.s3.VaultS3Client
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import java.io.File

class VaultRepository(private val context: Context) {

    companion object {
        private const val DEFAULT_VAULT_ID = "default"
    }

    private val json = Json { ignoreUnknownKeys = true }

    private fun vaultFile(): File = File(context.filesDir, "vault.bin")

    // ========================================================================
    // Local file operations
    // ========================================================================

    suspend fun vaultFileExists(): Boolean = withContext(Dispatchers.IO) {
        vaultFile().exists()
    }

    suspend fun readVaultFile(): ByteArray? = withContext(Dispatchers.IO) {
        val f = vaultFile()
        if (f.exists()) f.readBytes() else null
    }

    suspend fun writeVaultFile(bytes: ByteArray) = withContext(Dispatchers.IO) {
        vaultFile().writeBytes(bytes)
    }

    suspend fun deleteVaultFile() = withContext(Dispatchers.IO) {
        val f = vaultFile()
        if (f.exists()) f.delete()
    }

    // ========================================================================
    // Session management
    // ========================================================================

    suspend fun createVault(masterPassword: String): String = withContext(Dispatchers.IO) {
        VaultBridge.createVault(DEFAULT_VAULT_ID, masterPassword)
    }

    suspend fun loadVault(vaultBytes: ByteArray, etag: String = "") = withContext(Dispatchers.IO) {
        VaultBridge.loadVault(DEFAULT_VAULT_ID, vaultBytes, etag)
    }

    suspend fun unlock(masterPassword: String) = withContext(Dispatchers.IO) {
        VaultBridge.unlock(DEFAULT_VAULT_ID, masterPassword)
    }

    suspend fun unlockWithRecoveryKey(recoveryKey: String) = withContext(Dispatchers.IO) {
        VaultBridge.unlockWithRecoveryKey(DEFAULT_VAULT_ID, recoveryKey)
    }

    suspend fun lock(): ByteArray = withContext(Dispatchers.IO) {
        VaultBridge.lock(DEFAULT_VAULT_ID)
    }

    suspend fun getVaultBytes(): ByteArray = withContext(Dispatchers.IO) {
        VaultBridge.getVaultBytes(DEFAULT_VAULT_ID)
    }

    suspend fun isUnlocked(): Boolean = withContext(Dispatchers.IO) {
        VaultBridge.isUnlocked(DEFAULT_VAULT_ID)
    }

    // ========================================================================
    // Entry operations
    // ========================================================================

    suspend fun listEntries(
        searchQuery: String? = null,
        entryType: String? = null,
        labelId: String? = null,
        includeTrash: Boolean = false,
        onlyFavorites: Boolean = false,
        sortField: String? = null,
        sortOrder: String? = null
    ): List<EntryRow> = withContext(Dispatchers.IO) {
        val jsonStr = VaultBridge.listEntries(DEFAULT_VAULT_ID, searchQuery, entryType, labelId, includeTrash, onlyFavorites, sortField, sortOrder)
        json.decodeFromString<List<EntryRow>>(jsonStr)
    }

    suspend fun getEntry(id: String): Entry = withContext(Dispatchers.IO) {
        val jsonStr = VaultBridge.getEntry(DEFAULT_VAULT_ID, id)
        json.decodeFromString<Entry>(jsonStr)
    }

    suspend fun createEntry(
        entryType: String,
        name: String,
        notes: String?,
        typedValueJson: String,
        labelIds: List<String>,
        customFieldsJson: String?
    ): String = withContext(Dispatchers.IO) {
        val labelIdsJson = json.encodeToString(ListSerializer(String.serializer()), labelIds)
        VaultBridge.createEntry(DEFAULT_VAULT_ID, entryType, name, notes, typedValueJson, labelIdsJson, customFieldsJson)
    }

    suspend fun updateEntry(
        id: String,
        name: String,
        typedValueJson: String?,
        notes: String?,
        labelIds: List<String>?,
        customFieldsJson: String?
    ) = withContext(Dispatchers.IO) {
        val labelIdsJson = labelIds?.let {
            json.encodeToString(ListSerializer(String.serializer()), it)
        }
        VaultBridge.updateEntry(DEFAULT_VAULT_ID, id, name, typedValueJson, notes, labelIdsJson, customFieldsJson)
    }

    suspend fun deleteEntry(id: String) = withContext(Dispatchers.IO) {
        VaultBridge.deleteEntry(DEFAULT_VAULT_ID, id)
    }

    suspend fun restoreEntry(id: String) = withContext(Dispatchers.IO) {
        VaultBridge.restoreEntry(DEFAULT_VAULT_ID, id)
    }

    suspend fun purgeEntry(id: String) = withContext(Dispatchers.IO) {
        VaultBridge.purgeEntry(DEFAULT_VAULT_ID, id)
    }

    suspend fun setFavorite(id: String, isFavorite: Boolean) = withContext(Dispatchers.IO) {
        VaultBridge.setFavorite(DEFAULT_VAULT_ID, id, isFavorite)
    }

    // ========================================================================
    // Label operations
    // ========================================================================

    suspend fun listLabels(): List<Label> = withContext(Dispatchers.IO) {
        val jsonStr = VaultBridge.listLabels(DEFAULT_VAULT_ID)
        json.decodeFromString<List<Label>>(jsonStr)
    }

    suspend fun createLabel(name: String): String = withContext(Dispatchers.IO) {
        VaultBridge.createLabel(DEFAULT_VAULT_ID, name)
    }

    suspend fun deleteLabel(id: String) = withContext(Dispatchers.IO) {
        VaultBridge.deleteLabel(DEFAULT_VAULT_ID, id)
    }

    suspend fun renameLabel(id: String, newName: String) = withContext(Dispatchers.IO) {
        VaultBridge.renameLabel(DEFAULT_VAULT_ID, id, newName)
    }

    suspend fun setEntryLabels(entryId: String, labelIds: List<String>) = withContext(Dispatchers.IO) {
        val labelIdsJson = json.encodeToString(ListSerializer(String.serializer()), labelIds)
        VaultBridge.setEntryLabels(DEFAULT_VAULT_ID, entryId, labelIdsJson)
    }

    // ========================================================================
    // Security
    // ========================================================================

    suspend fun verifyPassword(password: String) = withContext(Dispatchers.IO) {
        VaultBridge.verifyPassword(DEFAULT_VAULT_ID, password)
    }

    suspend fun changeMasterPassword(oldPassword: String, newPassword: String) = withContext(Dispatchers.IO) {
        VaultBridge.changeMasterPassword(DEFAULT_VAULT_ID, oldPassword, newPassword)
    }

    suspend fun rotateDek(password: String): String = withContext(Dispatchers.IO) {
        VaultBridge.rotateDek(DEFAULT_VAULT_ID, password)
    }

    suspend fun regenerateRecoveryKey(password: String): String = withContext(Dispatchers.IO) {
        VaultBridge.regenerateRecoveryKey(DEFAULT_VAULT_ID, password)
    }

    // ========================================================================
    // Transfer Config
    // ========================================================================

    suspend fun encryptTransferConfig(password: String, configJson: String): String = withContext(Dispatchers.IO) {
        VaultBridge.encryptTransferConfig(password, configJson)
    }

    suspend fun decryptTransferConfig(password: String, transferString: String): String = withContext(Dispatchers.IO) {
        VaultBridge.decryptTransferConfig(password, transferString)
    }

    // ========================================================================
    // Utilities
    // ========================================================================

    suspend fun generatePassword(
        length: Int = 16,
        lowercase: Boolean = true,
        uppercase: Boolean = true,
        numbers: Boolean = true,
        symbols1: Boolean = true,
        symbols2: Boolean = true,
        symbols3: Boolean = true
    ): String = withContext(Dispatchers.IO) {
        VaultBridge.generatePassword(length, lowercase, uppercase, numbers, symbols1, symbols2, symbols3)
    }

    suspend fun generateTotp(secret: String, digits: Int = 6, period: Int = 30): String = withContext(Dispatchers.IO) {
        VaultBridge.generateTotp(secret, digits, period)
    }

    suspend fun generateTotpDefault(secret: String): String = withContext(Dispatchers.IO) {
        VaultBridge.generateTotpDefault(secret)
    }

    suspend fun generateTotpFromValue(value: String): String = withContext(Dispatchers.IO) {
        VaultBridge.generateTotpFromValue(value)
    }

    suspend fun parseTotpPeriod(value: String): Long = withContext(Dispatchers.IO) {
        VaultBridge.parseTotpPeriod(value)
    }

    // ========================================================================
    // Sync
    // ========================================================================

    private fun parseS3Config(configJson: String): S3Config =
        json.decodeFromString<S3Config>(configJson)

    private suspend fun mergeRemoteVault(remoteBytes: ByteArray, remoteEtag: String) = withContext(Dispatchers.IO) {
        VaultBridge.mergeRemoteVault(DEFAULT_VAULT_ID, remoteBytes, remoteEtag)
    }

    private suspend fun updateEtag(etag: String) = withContext(Dispatchers.IO) {
        VaultBridge.updateEtag(DEFAULT_VAULT_ID, etag)
    }

    private suspend fun getEtag(): String? = withContext(Dispatchers.IO) {
        VaultBridge.getEtag(DEFAULT_VAULT_ID)
    }

    suspend fun syncVault(configJson: String): SyncResult = withContext(Dispatchers.IO) {
        val s3Config = parseS3Config(configJson)
        val client = VaultS3Client(s3Config)
        val maxRetries = 5

        for (attempt in 0 until maxRetries) {
            val remote = client.download()

            if (remote == null) {
                // リモートに存在しない → ローカルをアップロード
                val bytes = getVaultBytes()
                val etag = getEtag()
                val newEtag = client.upload(bytes, etag)
                updateEtag(newEtag)
                val ts = System.currentTimeMillis() / 1000
                restoreLastSyncTime(ts)
                return@withContext SyncResult(synced = true, lastSyncedAt = ts)
            }

            val (remoteBytes, remoteEtag) = remote

            // Rust側でマージ（復号→auto_merge→GC→セッション更新）
            mergeRemoteVault(remoteBytes, remoteEtag)

            // マージ済みvaultをアップロード
            val mergedBytes = getVaultBytes()
            val currentEtag = getEtag()

            try {
                val newEtag = client.upload(mergedBytes, currentEtag)
                updateEtag(newEtag)
                val ts = System.currentTimeMillis() / 1000
                restoreLastSyncTime(ts)
                return@withContext SyncResult(synced = true, lastSyncedAt = ts)
            } catch (_: ConflictException) {
                if (attempt + 1 == maxRetries) {
                    throw RuntimeException("Sync failed after maximum retries")
                }
            }
        }

        throw RuntimeException("Sync failed after maximum retries")
    }

    suspend fun pushVault(configJson: String): Long = withContext(Dispatchers.IO) {
        val s3Config = parseS3Config(configJson)
        val client = VaultS3Client(s3Config)
        val vaultBytes = getVaultBytes()
        val etag = getEtag()
        val newEtag = client.upload(vaultBytes, etag)
        updateEtag(newEtag)
        System.currentTimeMillis() / 1000
    }

    suspend fun downloadVault(configJson: String): Boolean = withContext(Dispatchers.IO) {
        val s3Config = parseS3Config(configJson)
        val client = VaultS3Client(s3Config)
        val remote = client.download()
        if (remote == null) {
            false
        } else {
            val (remoteBytes, remoteEtag) = remote
            loadVault(remoteBytes, remoteEtag)
            true
        }
    }

    suspend fun getLastSyncTime(): Long = withContext(Dispatchers.IO) {
        VaultBridge.getLastSyncTime(DEFAULT_VAULT_ID)
    }

    suspend fun restoreLastSyncTime(ts: Long) = withContext(Dispatchers.IO) {
        VaultBridge.restoreLastSyncTime(DEFAULT_VAULT_ID, ts)
    }

    // ========================================================================
    // Combined helpers
    // ========================================================================

    suspend fun saveAndSync(s3ConfigJson: String?) {
        val vaultBytes = getVaultBytes()
        writeVaultFile(vaultBytes)
        if (s3ConfigJson == null) return
        val result = syncVault(s3ConfigJson)
        if (result.synced) {
            // マージでリモートの変更が取り込まれた可能性があるため再保存
            val mergedBytes = getVaultBytes()
            writeVaultFile(mergedBytes)
        }
    }

    suspend fun saveAndPush(s3ConfigJson: String?) {
        val vaultBytes = getVaultBytes()
        writeVaultFile(vaultBytes)
        s3ConfigJson?.let { pushVault(it) }
    }
}
