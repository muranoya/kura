package net.meshpeak.kura.data.repository

import android.content.Context
import net.meshpeak.kura.bridge.VaultBridge
import net.meshpeak.kura.data.model.*
import net.meshpeak.kura.data.s3.ConflictException
import net.meshpeak.kura.data.s3.VaultS3Client
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import java.io.File

interface IVaultRepository {
    // Local file operations
    suspend fun vaultFileExists(): Boolean
    suspend fun readVaultFile(): ByteArray?
    suspend fun writeVaultFile(bytes: ByteArray)
    suspend fun deleteVaultFile()

    // Session management
    suspend fun createVault(masterPassword: String): String
    suspend fun loadVault(vaultBytes: ByteArray, etag: String = "")
    suspend fun unlock(masterPassword: String)
    suspend fun unlockWithRecoveryKey(recoveryKey: String)
    suspend fun lock(): ByteArray
    suspend fun getVaultBytes(): ByteArray
    suspend fun isUnlocked(): Boolean

    // Entry operations
    suspend fun listEntries(
        searchQuery: String? = null,
        entryType: String? = null,
        labelId: String? = null,
        includeTrash: Boolean = false,
        onlyFavorites: Boolean = false,
        sortField: String? = null,
        sortOrder: String? = null
    ): List<EntryRow>
    suspend fun getEntry(id: String): Entry
    suspend fun createEntry(
        entryType: String,
        name: String,
        notes: String?,
        typedValueJson: String,
        labelIds: List<String>,
        customFieldsJson: String?
    ): String
    suspend fun updateEntry(
        id: String,
        name: String,
        typedValueJson: String?,
        notes: String?,
        labelIds: List<String>?,
        customFieldsJson: String?
    )
    suspend fun deleteEntry(id: String)
    suspend fun restoreEntry(id: String)
    suspend fun purgeEntry(id: String)
    suspend fun setFavorite(id: String, isFavorite: Boolean)

    // Label operations
    suspend fun listLabels(): List<Label>
    suspend fun createLabel(name: String): String
    suspend fun deleteLabel(id: String)
    suspend fun renameLabel(id: String, newName: String)
    suspend fun setEntryLabels(entryId: String, labelIds: List<String>)

    // Security
    suspend fun verifyPassword(password: String)
    suspend fun changeMasterPassword(oldPassword: String, newPassword: String)
    suspend fun rotateDek(password: String): String
    suspend fun regenerateRecoveryKey(password: String): String

    // Export
    suspend fun exportBitwardenJson(): String

    // Transfer Config
    suspend fun encryptTransferConfig(password: String, configJson: String): String
    suspend fun decryptTransferConfig(password: String, transferString: String): String

    // Utilities
    suspend fun generatePassword(
        length: Int = 16,
        lowercase: Boolean = true,
        uppercase: Boolean = true,
        numbers: Boolean = true,
        symbols1: Boolean = true,
        symbols2: Boolean = true,
        symbols3: Boolean = true
    ): String
    suspend fun generateTotp(secret: String, digits: Int = 6, period: Int = 30): String
    suspend fun generateTotpDefault(secret: String): String
    suspend fun generateTotpFromValue(value: String): String
    suspend fun parseTotpPeriod(value: String): Long

    // Sync
    suspend fun syncVault(configJson: String): SyncResult
    suspend fun pushVault(configJson: String)
    suspend fun downloadVault(configJson: String): Boolean
    suspend fun getLastSyncTime(): Long
    suspend fun restoreLastSyncTime(ts: Long)

    // Combined helpers
    suspend fun saveLocally()
    suspend fun syncInBackground(s3ConfigJson: String?)
    suspend fun saveAndSync(s3ConfigJson: String?)
    suspend fun saveAndPush(s3ConfigJson: String?)
}

class VaultRepository(private val context: Context) : IVaultRepository {

    companion object {
        private const val DEFAULT_VAULT_ID = "default"
    }

    private val json = Json { ignoreUnknownKeys = true }

    private fun vaultFile(): File = File(context.filesDir, "vault.bin")

    // ========================================================================
    // Local file operations
    // ========================================================================

    override suspend fun vaultFileExists(): Boolean = withContext(Dispatchers.IO) {
        vaultFile().exists()
    }

    override suspend fun readVaultFile(): ByteArray? = withContext(Dispatchers.IO) {
        val f = vaultFile()
        if (f.exists()) f.readBytes() else null
    }

    override suspend fun writeVaultFile(bytes: ByteArray) = withContext(Dispatchers.IO) {
        vaultFile().writeBytes(bytes)
    }

    override suspend fun deleteVaultFile() = withContext(Dispatchers.IO) {
        val f = vaultFile()
        if (f.exists()) f.delete()
    }

    // ========================================================================
    // Session management
    // ========================================================================

    override suspend fun createVault(masterPassword: String): String = withContext(Dispatchers.IO) {
        VaultBridge.createVault(DEFAULT_VAULT_ID, masterPassword)
    }

    override suspend fun loadVault(vaultBytes: ByteArray, etag: String) = withContext(Dispatchers.IO) {
        VaultBridge.loadVault(DEFAULT_VAULT_ID, vaultBytes, etag)
    }

    override suspend fun unlock(masterPassword: String) = withContext(Dispatchers.IO) {
        VaultBridge.unlock(DEFAULT_VAULT_ID, masterPassword)
    }

    override suspend fun unlockWithRecoveryKey(recoveryKey: String) = withContext(Dispatchers.IO) {
        VaultBridge.unlockWithRecoveryKey(DEFAULT_VAULT_ID, recoveryKey)
    }

    override suspend fun lock(): ByteArray = withContext(Dispatchers.IO) {
        VaultBridge.lock(DEFAULT_VAULT_ID)
    }

    override suspend fun getVaultBytes(): ByteArray = withContext(Dispatchers.IO) {
        VaultBridge.getVaultBytes(DEFAULT_VAULT_ID)
    }

    override suspend fun isUnlocked(): Boolean = withContext(Dispatchers.IO) {
        VaultBridge.isUnlocked(DEFAULT_VAULT_ID)
    }

    // ========================================================================
    // Entry operations
    // ========================================================================

    override suspend fun listEntries(
        searchQuery: String?,
        entryType: String?,
        labelId: String?,
        includeTrash: Boolean,
        onlyFavorites: Boolean,
        sortField: String?,
        sortOrder: String?
    ): List<EntryRow> = withContext(Dispatchers.IO) {
        val jsonStr = VaultBridge.listEntries(DEFAULT_VAULT_ID, searchQuery, entryType, labelId, includeTrash, onlyFavorites, sortField, sortOrder)
        json.decodeFromString<List<EntryRow>>(jsonStr)
    }

    override suspend fun getEntry(id: String): Entry = withContext(Dispatchers.IO) {
        val jsonStr = VaultBridge.getEntry(DEFAULT_VAULT_ID, id)
        json.decodeFromString<Entry>(jsonStr)
    }

    override suspend fun createEntry(
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

    override suspend fun updateEntry(
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

    override suspend fun deleteEntry(id: String) = withContext(Dispatchers.IO) {
        VaultBridge.deleteEntry(DEFAULT_VAULT_ID, id)
    }

    override suspend fun restoreEntry(id: String) = withContext(Dispatchers.IO) {
        VaultBridge.restoreEntry(DEFAULT_VAULT_ID, id)
    }

    override suspend fun purgeEntry(id: String) = withContext(Dispatchers.IO) {
        VaultBridge.purgeEntry(DEFAULT_VAULT_ID, id)
    }

    override suspend fun setFavorite(id: String, isFavorite: Boolean) = withContext(Dispatchers.IO) {
        VaultBridge.setFavorite(DEFAULT_VAULT_ID, id, isFavorite)
    }

    // ========================================================================
    // Label operations
    // ========================================================================

    override suspend fun listLabels(): List<Label> = withContext(Dispatchers.IO) {
        val jsonStr = VaultBridge.listLabels(DEFAULT_VAULT_ID)
        json.decodeFromString<List<Label>>(jsonStr)
    }

    override suspend fun createLabel(name: String): String = withContext(Dispatchers.IO) {
        VaultBridge.createLabel(DEFAULT_VAULT_ID, name)
    }

    override suspend fun deleteLabel(id: String) = withContext(Dispatchers.IO) {
        VaultBridge.deleteLabel(DEFAULT_VAULT_ID, id)
    }

    override suspend fun renameLabel(id: String, newName: String) = withContext(Dispatchers.IO) {
        VaultBridge.renameLabel(DEFAULT_VAULT_ID, id, newName)
    }

    override suspend fun setEntryLabels(entryId: String, labelIds: List<String>) = withContext(Dispatchers.IO) {
        val labelIdsJson = json.encodeToString(ListSerializer(String.serializer()), labelIds)
        VaultBridge.setEntryLabels(DEFAULT_VAULT_ID, entryId, labelIdsJson)
    }

    // ========================================================================
    // Security
    // ========================================================================

    override suspend fun verifyPassword(password: String) = withContext(Dispatchers.IO) {
        VaultBridge.verifyPassword(DEFAULT_VAULT_ID, password)
    }

    override suspend fun changeMasterPassword(oldPassword: String, newPassword: String) = withContext(Dispatchers.IO) {
        VaultBridge.changeMasterPassword(DEFAULT_VAULT_ID, oldPassword, newPassword)
    }

    override suspend fun rotateDek(password: String): String = withContext(Dispatchers.IO) {
        VaultBridge.rotateDek(DEFAULT_VAULT_ID, password)
    }

    override suspend fun regenerateRecoveryKey(password: String): String = withContext(Dispatchers.IO) {
        VaultBridge.regenerateRecoveryKey(DEFAULT_VAULT_ID, password)
    }

    // ========================================================================
    // Export
    // ========================================================================

    override suspend fun exportBitwardenJson(): String = withContext(Dispatchers.IO) {
        VaultBridge.exportBitwardenJson(DEFAULT_VAULT_ID)
    }

    // ========================================================================
    // Transfer Config
    // ========================================================================

    override suspend fun encryptTransferConfig(password: String, configJson: String): String = withContext(Dispatchers.IO) {
        VaultBridge.encryptTransferConfig(password, configJson)
    }

    override suspend fun decryptTransferConfig(password: String, transferString: String): String = withContext(Dispatchers.IO) {
        VaultBridge.decryptTransferConfig(password, transferString)
    }

    // ========================================================================
    // Utilities
    // ========================================================================

    override suspend fun generatePassword(
        length: Int,
        lowercase: Boolean,
        uppercase: Boolean,
        numbers: Boolean,
        symbols1: Boolean,
        symbols2: Boolean,
        symbols3: Boolean
    ): String = withContext(Dispatchers.IO) {
        VaultBridge.generatePassword(length, lowercase, uppercase, numbers, symbols1, symbols2, symbols3)
    }

    override suspend fun generateTotp(secret: String, digits: Int, period: Int): String = withContext(Dispatchers.IO) {
        VaultBridge.generateTotp(secret, digits, period)
    }

    override suspend fun generateTotpDefault(secret: String): String = withContext(Dispatchers.IO) {
        VaultBridge.generateTotpDefault(secret)
    }

    override suspend fun generateTotpFromValue(value: String): String = withContext(Dispatchers.IO) {
        VaultBridge.generateTotpFromValue(value)
    }

    override suspend fun parseTotpPeriod(value: String): Long = withContext(Dispatchers.IO) {
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

    override suspend fun syncVault(configJson: String): SyncResult = withContext(Dispatchers.IO) {
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

    override suspend fun pushVault(configJson: String): Unit = withContext(Dispatchers.IO) {
        val s3Config = parseS3Config(configJson)
        val client = VaultS3Client(s3Config)
        val vaultBytes = getVaultBytes()
        val etag = getEtag()
        val newEtag = client.upload(vaultBytes, etag)
        updateEtag(newEtag)
    }

    override suspend fun downloadVault(configJson: String): Boolean = withContext(Dispatchers.IO) {
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

    override suspend fun getLastSyncTime(): Long = withContext(Dispatchers.IO) {
        VaultBridge.getLastSyncTime(DEFAULT_VAULT_ID)
    }

    override suspend fun restoreLastSyncTime(ts: Long) = withContext(Dispatchers.IO) {
        VaultBridge.restoreLastSyncTime(DEFAULT_VAULT_ID, ts)
    }

    // ========================================================================
    // Combined helpers
    // ========================================================================

    override suspend fun saveLocally() {
        val vaultBytes = getVaultBytes()
        writeVaultFile(vaultBytes)
    }

    override suspend fun syncInBackground(s3ConfigJson: String?) {
        if (s3ConfigJson == null) return
        val result = syncVault(s3ConfigJson)
        if (result.synced) {
            // マージでリモートの変更が取り込まれた可能性があるため再保存
            val mergedBytes = getVaultBytes()
            writeVaultFile(mergedBytes)
        }
    }

    override suspend fun saveAndSync(s3ConfigJson: String?) {
        saveLocally()
        syncInBackground(s3ConfigJson)
    }

    override suspend fun saveAndPush(s3ConfigJson: String?) {
        val vaultBytes = getVaultBytes()
        writeVaultFile(vaultBytes)
        s3ConfigJson?.let { pushVault(it) }
    }
}
