package com.kura.app.bridge

object VaultBridge {
    init {
        System.loadLibrary("vault_jni")
    }

    // Session management
    external fun createVault(masterPassword: String): String
    external fun loadVault(vaultBytes: ByteArray, etag: String)
    external fun unlock(masterPassword: String)
    external fun unlockWithRecoveryKey(recoveryKey: String)
    external fun lock(): ByteArray
    external fun getVaultBytes(): ByteArray
    external fun isUnlocked(): Boolean

    // Entry operations
    external fun listEntries(
        searchQuery: String?,
        entryType: String?,
        labelId: String?,
        includeTrash: Boolean,
        onlyFavorites: Boolean
    ): String

    external fun getEntry(id: String): String
    external fun createEntry(
        entryType: String,
        name: String,
        notes: String?,
        typedValueJson: String,
        labelIdsJson: String,
        customFieldsJson: String?
    ): String

    external fun updateEntry(
        id: String,
        name: String,
        typedValueJson: String?,
        notes: String?,
        labelIdsJson: String?,
        customFieldsJson: String?
    )

    external fun deleteEntry(id: String)
    external fun restoreEntry(id: String)
    external fun purgeEntry(id: String)
    external fun setFavorite(id: String, isFavorite: Boolean)

    // Label operations
    external fun listLabels(): String
    external fun createLabel(name: String): String
    external fun deleteLabel(id: String)
    external fun renameLabel(id: String, newName: String)
    external fun setEntryLabels(entryId: String, labelIdsJson: String)

    // Security
    external fun changeMasterPassword(oldPassword: String, newPassword: String)
    external fun rotateDek(password: String): String
    external fun regenerateRecoveryKey(password: String): String

    // Utilities
    external fun generatePassword(
        length: Int,
        uppercase: Boolean,
        lowercase: Boolean,
        numbers: Boolean,
        symbols: Boolean
    ): String

    external fun generateTotp(secret: String, digits: Int, period: Int): String
    external fun generateTotpDefault(secret: String): String

    // Sync
    external fun mergeRemoteVault(remoteBytes: ByteArray, remoteEtag: String)
    external fun updateEtag(etag: String)
    external fun getEtag(): String?
    external fun getLastSyncTime(): Long
    external fun restoreLastSyncTime(ts: Long)
}
