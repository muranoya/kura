package com.kura.app.bridge

object VaultBridge {
    init {
        System.loadLibrary("vault_jni")
    }

    // Instance management
    external fun destroyVault(vaultId: String)

    // Session management
    external fun createVault(vaultId: String, masterPassword: String): String
    external fun loadVault(vaultId: String, vaultBytes: ByteArray, etag: String)
    external fun unlock(vaultId: String, masterPassword: String)
    external fun unlockWithRecoveryKey(vaultId: String, recoveryKey: String)
    external fun lock(vaultId: String): ByteArray
    external fun getVaultBytes(vaultId: String): ByteArray
    external fun isUnlocked(vaultId: String): Boolean

    // Entry operations
    external fun listEntries(
        vaultId: String,
        searchQuery: String?,
        entryType: String?,
        labelId: String?,
        includeTrash: Boolean,
        onlyFavorites: Boolean
    ): String

    external fun getEntry(vaultId: String, id: String): String
    external fun createEntry(
        vaultId: String,
        entryType: String,
        name: String,
        notes: String?,
        typedValueJson: String,
        labelIdsJson: String,
        customFieldsJson: String?
    ): String

    external fun updateEntry(
        vaultId: String,
        id: String,
        name: String,
        typedValueJson: String?,
        notes: String?,
        labelIdsJson: String?,
        customFieldsJson: String?
    )

    external fun deleteEntry(vaultId: String, id: String)
    external fun restoreEntry(vaultId: String, id: String)
    external fun purgeEntry(vaultId: String, id: String)
    external fun setFavorite(vaultId: String, id: String, isFavorite: Boolean)

    // Label operations
    external fun listLabels(vaultId: String): String
    external fun createLabel(vaultId: String, name: String): String
    external fun deleteLabel(vaultId: String, id: String)
    external fun renameLabel(vaultId: String, id: String, newName: String)
    external fun setEntryLabels(vaultId: String, entryId: String, labelIdsJson: String)

    // Security
    external fun changeMasterPassword(vaultId: String, oldPassword: String, newPassword: String)
    external fun rotateDek(vaultId: String, password: String): String
    external fun regenerateRecoveryKey(vaultId: String, password: String): String

    // Utilities (no vaultId needed)
    external fun generatePassword(
        length: Int,
        uppercase: Boolean,
        lowercase: Boolean,
        numbers: Boolean,
        symbols: Boolean
    ): String

    external fun generateTotp(secret: String, digits: Int, period: Int): String
    external fun generateTotpDefault(secret: String): String
    external fun generateTotpFromValue(value: String): String
    external fun parseTotpPeriod(value: String): Long

    // Sync
    external fun mergeRemoteVault(vaultId: String, remoteBytes: ByteArray, remoteEtag: String)
    external fun updateEtag(vaultId: String, etag: String)
    external fun getEtag(vaultId: String): String?
    external fun getLastSyncTime(vaultId: String): Long
    external fun restoreLastSyncTime(vaultId: String, ts: Long)
}
