package net.meshpeak.kura.testutil

import net.meshpeak.kura.data.model.*
import net.meshpeak.kura.data.repository.IVaultRepository

class FakeVaultRepository : IVaultRepository {

    // Configurable results for tests
    var vaultFileExistsResult: Boolean = false
    var readVaultFileResult: ByteArray? = null
    var createVaultResult: String = "test-recovery-key-12345"
    var unlockError: Exception? = null
    var unlockWithRecoveryKeyError: Exception? = null
    var getVaultBytesResult: ByteArray = byteArrayOf(1, 2, 3)
    var isUnlockedResult: Boolean = false
    var downloadVaultResult: Boolean = false
    var downloadVaultError: Exception? = null
    var syncVaultResult: SyncResult = SyncResult(synced = true, lastSyncedAt = 1000L)
    var createVaultError: Exception? = null
    var decryptTransferConfigResult: String = "{}"
    var decryptTransferConfigError: Exception? = null
    var lastSyncTimeResult: Long = 0L

    // Tracking calls for assertions
    var writeVaultFileCalled = false
    var writeVaultFileBytes: ByteArray? = null
    var createVaultCalledWith: String? = null
    var unlockCalledWith: String? = null
    var downloadVaultCalledWith: String? = null
    var saveAndSyncCalledWith: String? = null
    var saveLocallyCalled = false

    override suspend fun vaultFileExists(): Boolean = vaultFileExistsResult
    override suspend fun readVaultFile(): ByteArray? = readVaultFileResult

    override suspend fun writeVaultFile(bytes: ByteArray) {
        writeVaultFileCalled = true
        writeVaultFileBytes = bytes
    }

    override suspend fun deleteVaultFile() {}

    override suspend fun createVault(masterPassword: String): String {
        createVaultCalledWith = masterPassword
        createVaultError?.let { throw it }
        return createVaultResult
    }

    override suspend fun loadVault(vaultBytes: ByteArray, etag: String) {}

    override suspend fun unlock(masterPassword: String) {
        unlockCalledWith = masterPassword
        unlockError?.let { throw it }
    }

    override suspend fun unlockWithRecoveryKey(recoveryKey: String) {
        unlockWithRecoveryKeyError?.let { throw it }
    }

    override suspend fun lock(): ByteArray = byteArrayOf()
    override suspend fun getVaultBytes(): ByteArray = getVaultBytesResult
    override suspend fun isUnlocked(): Boolean = isUnlockedResult

    override suspend fun listEntries(
        searchQuery: String?,
        entryType: String?,
        labelId: String?,
        includeTrash: Boolean,
        onlyFavorites: Boolean,
        sortField: String?,
        sortOrder: String?
    ): List<EntryRow> = emptyList()

    override suspend fun getEntry(id: String): Entry {
        throw NotImplementedError("Not used in onboarding tests")
    }

    override suspend fun createEntry(
        entryType: String,
        name: String,
        notes: String?,
        typedValueJson: String,
        labelIds: List<String>,
        customFieldsJson: String?
    ): String = ""

    override suspend fun updateEntry(
        id: String,
        name: String,
        typedValueJson: String?,
        notes: String?,
        labelIds: List<String>?,
        customFieldsJson: String?
    ) {}

    override suspend fun deleteEntry(id: String) {}
    override suspend fun restoreEntry(id: String) {}
    override suspend fun purgeEntry(id: String) {}
    override suspend fun setFavorite(id: String, isFavorite: Boolean) {}

    override suspend fun listLabels(): List<Label> = emptyList()
    override suspend fun createLabel(name: String): String = ""
    override suspend fun deleteLabel(id: String) {}
    override suspend fun renameLabel(id: String, newName: String) {}
    override suspend fun setEntryLabels(entryId: String, labelIds: List<String>) {}

    override suspend fun verifyPassword(password: String) {}
    override suspend fun changeMasterPassword(oldPassword: String, newPassword: String) {}
    override suspend fun rotateDek(password: String): String = ""
    override suspend fun regenerateRecoveryKey(password: String): String = ""

    override suspend fun encryptTransferConfig(password: String, configJson: String): String = ""

    override suspend fun decryptTransferConfig(password: String, transferString: String): String {
        decryptTransferConfigError?.let { throw it }
        return decryptTransferConfigResult
    }

    override suspend fun generatePassword(
        length: Int,
        lowercase: Boolean,
        uppercase: Boolean,
        numbers: Boolean,
        symbols1: Boolean,
        symbols2: Boolean,
        symbols3: Boolean
    ): String = "generated-password"

    override suspend fun generateTotp(secret: String, digits: Int, period: Int): String = "123456"
    override suspend fun generateTotpDefault(secret: String): String = "123456"
    override suspend fun generateTotpFromValue(value: String): String = "123456"
    override suspend fun parseTotpPeriod(value: String): Long = 30L

    override suspend fun syncVault(configJson: String): SyncResult = syncVaultResult

    override suspend fun pushVault(configJson: String) {}

    override suspend fun downloadVault(configJson: String): Boolean {
        downloadVaultCalledWith = configJson
        downloadVaultError?.let { throw it }
        return downloadVaultResult
    }

    override suspend fun getLastSyncTime(): Long = lastSyncTimeResult
    override suspend fun restoreLastSyncTime(ts: Long) {}

    override suspend fun saveLocally() {
        saveLocallyCalled = true
    }

    override suspend fun syncInBackground(s3ConfigJson: String?) {}

    override suspend fun saveAndSync(s3ConfigJson: String?) {
        saveAndSyncCalledWith = s3ConfigJson
    }

    override suspend fun saveAndPush(s3ConfigJson: String?) {}
}
