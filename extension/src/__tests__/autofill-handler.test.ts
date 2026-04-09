import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupPendingFlow,
  handleAutofillMessage,
  initAutofill,
  type VaultApi,
} from '../background/autofill'

// ========== Test helpers ==========

interface MockEntry {
  id: string
  name: string
  entry_type: string
  url?: string
  username?: string
  typed_value: Record<string, unknown>
  custom_fields?: Array<{ field_type: string; value: string }>
  subtitle?: string | null
}

function createMockVaultApi(entries: MockEntry[]): VaultApi {
  return {
    api_list_login_urls: vi.fn((_vaultId: string) => {
      const loginEntries = entries
        .filter((e) => e.entry_type === 'login' && e.url)
        .map((e) => ({
          id: e.id,
          name: e.name,
          url: e.url,
          username: e.username ?? null,
        }))
      return JSON.stringify(loginEntries)
    }),
    api_get_entry: vi.fn((_vaultId: string, id: string) => {
      const entry = entries.find((e) => e.id === id)
      if (!entry) throw new Error('Entry not found')
      return JSON.stringify(entry)
    }),
    api_list_entries: vi.fn(
      (
        _vaultId: string,
        _searchQuery: string | null,
        type: string | null,
        _labelId: string | null,
        _includeTrash: boolean,
        _onlyFavorites: boolean,
        _sortField: string | null,
        _sortOrder: string | null,
      ) => {
        const filtered = entries
          .filter((e) => !type || e.entry_type === type)
          .map((e) => ({ id: e.id, name: e.name, subtitle: e.subtitle ?? null }))
        return JSON.stringify(filtered)
      },
    ),
    api_generate_totp_from_value: vi.fn((_value: string) => '123456'),
    api_create_entry: vi.fn(
      (
        _vaultId: string,
        _entryType: string,
        _name: string,
        _notes: string | null,
        _typedValue: string,
        _labelIds: string[],
        _customFields: string | null,
      ) => 'new-entry-id',
    ),
  }
}

function callHandler(
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender = {},
): Promise<unknown> {
  return new Promise((resolve) => {
    handleAutofillMessage(message, sender, resolve)
  })
}

// ========== Tests ==========

describe('handleAutofillMessage', () => {
  const testEntries: MockEntry[] = [
    {
      id: 'entry-1',
      name: 'Example Login',
      entry_type: 'login',
      url: 'https://example.com',
      username: 'user@example.com',
      typed_value: { username: 'user@example.com', password: 'secret123' },
    },
    {
      id: 'entry-2',
      name: 'Another Login',
      entry_type: 'login',
      url: 'https://login.example.com/auth',
      username: 'admin@example.com',
      typed_value: { username: 'admin@example.com', password: 'admin456' },
    },
    {
      id: 'entry-3',
      name: 'Different Site',
      entry_type: 'login',
      url: 'https://other.com',
      username: 'test@other.com',
      typed_value: { username: 'test@other.com', password: 'other789' },
    },
    {
      id: 'entry-4',
      name: 'No Protocol',
      entry_type: 'login',
      url: 'example.com/login',
      username: 'noproto@example.com',
      typed_value: { username: 'noproto@example.com', password: 'noproto' },
    },
    {
      id: 'entry-totp',
      name: 'TOTP Entry',
      entry_type: 'login',
      url: 'https://example.com',
      username: 'totp@example.com',
      typed_value: { username: 'totp@example.com', password: 'totppwd' },
      custom_fields: [{ field_type: 'totp', value: 'otpauth://totp/test?secret=ABCDEF' }],
    },
    {
      id: 'entry-cc',
      name: 'My Credit Card',
      entry_type: 'credit_card',
      typed_value: {
        number: '4111111111111111',
        expiry: '12/28',
        cvv: '123',
        cardholder: 'John Doe',
      },
      subtitle: '•••• 1111',
    },
  ]

  let mockApi: VaultApi
  let unlocked: boolean

  beforeEach(() => {
    unlocked = true
    mockApi = createMockVaultApi(testEntries)
    initAutofill(
      mockApi,
      () => unlocked,
      async () => {},
      async () => {},
    )
  })

  // ========== AUTOFILL_GET_CREDENTIALS ==========

  describe('AUTOFILL_GET_CREDENTIALS', () => {
    it('returns error when vault is locked', async () => {
      unlocked = false
      const result = await callHandler({
        type: 'AUTOFILL_GET_CREDENTIALS',
        url: 'https://example.com',
      })
      expect(result).toEqual({ success: false, error: 'Vault not unlocked' })
    })

    it('returns error when URL is missing', async () => {
      const result = await callHandler({ type: 'AUTOFILL_GET_CREDENTIALS' })
      expect(result).toEqual({ success: false, error: 'URL required' })
    })

    it('returns matching credentials by eTLD+1', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_CREDENTIALS',
        url: 'https://www.example.com/page',
      })) as { success: boolean; credentials: Array<{ entryId: string }> }

      expect(result.success).toBe(true)
      const ids = result.credentials.map((c) => c.entryId)
      // entry-1 (example.com), entry-2 (login.example.com), entry-4 (example.com/login), entry-totp (example.com)
      expect(ids).toContain('entry-1')
      expect(ids).toContain('entry-2')
      expect(ids).toContain('entry-4')
      expect(ids).toContain('entry-totp')
      // entry-3 (other.com) should NOT match
      expect(ids).not.toContain('entry-3')
      // entry-cc (credit_card) should NOT appear
      expect(ids).not.toContain('entry-cc')
    })

    it('returns empty array when no entries match', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_CREDENTIALS',
        url: 'https://unknown-site.com',
      })) as { success: boolean; credentials: unknown[] }

      expect(result.success).toBe(true)
      expect(result.credentials).toEqual([])
    })

    it('handles entry URL without protocol', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_CREDENTIALS',
        url: 'https://example.com',
      })) as { success: boolean; credentials: Array<{ entryId: string }> }

      expect(result.success).toBe(true)
      const ids = result.credentials.map((c) => c.entryId)
      expect(ids).toContain('entry-4') // URL was "example.com/login" (no protocol)
    })

    it('returns empty array for invalid URL', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_CREDENTIALS',
        url: 'not-a-valid-url',
      })) as { success: boolean; credentials: unknown[] }

      expect(result.success).toBe(true)
      expect(result.credentials).toEqual([])
    })

    it('uses strict subdomain matching when strictSubdomain is true', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_CREDENTIALS',
        url: 'https://www.example.com/page',
        strictSubdomain: true,
      })) as { success: boolean; credentials: Array<{ entryId: string }> }

      expect(result.success).toBe(true)
      const ids = result.credentials.map((c) => c.entryId)
      // Only entries with exact hostname "www.example.com" should match
      // None of the test entries have "www.example.com" as their hostname
      expect(ids).not.toContain('entry-1') // example.com
      expect(ids).not.toContain('entry-2') // login.example.com
      expect(ids).not.toContain('entry-3') // other.com
    })

    it('strict subdomain matches exact hostname', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_CREDENTIALS',
        url: 'https://example.com/page',
        strictSubdomain: true,
      })) as { success: boolean; credentials: Array<{ entryId: string }> }

      expect(result.success).toBe(true)
      const ids = result.credentials.map((c) => c.entryId)
      // entry-1 has url "https://example.com" → hostname "example.com" → matches
      expect(ids).toContain('entry-1')
      // entry-4 has url "example.com/login" → hostname "example.com" → matches
      expect(ids).toContain('entry-4')
      // entry-totp has url "https://example.com" → hostname "example.com" → matches
      expect(ids).toContain('entry-totp')
      // entry-2 has url "https://login.example.com/auth" → hostname "login.example.com" → NO match
      expect(ids).not.toContain('entry-2')
    })

    it('defaults to eTLD+1 matching when strictSubdomain is not set', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_CREDENTIALS',
        url: 'https://login.example.com/page',
      })) as { success: boolean; credentials: Array<{ entryId: string }> }

      expect(result.success).toBe(true)
      const ids = result.credentials.map((c) => c.entryId)
      // eTLD+1 match: all example.com entries match
      expect(ids).toContain('entry-1')
      expect(ids).toContain('entry-2')
      expect(ids).toContain('entry-4')
      expect(ids).toContain('entry-totp')
    })

    it('does not include passwords in candidates', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_CREDENTIALS',
        url: 'https://example.com',
      })) as { success: boolean; credentials: Array<Record<string, unknown>> }

      expect(result.success).toBe(true)
      for (const credential of result.credentials) {
        expect(credential).not.toHaveProperty('password')
      }
    })
  })

  // ========== AUTOFILL_FILL_REQUEST ==========

  describe('AUTOFILL_FILL_REQUEST', () => {
    it('returns error when vault is locked', async () => {
      unlocked = false
      const result = await callHandler({
        type: 'AUTOFILL_FILL_REQUEST',
        entryId: 'entry-1',
      })
      expect(result).toEqual({ success: false, error: 'Vault not unlocked' })
    })

    it('returns error when entry ID is missing', async () => {
      const result = await callHandler({ type: 'AUTOFILL_FILL_REQUEST' })
      expect(result).toEqual({ success: false, error: 'Entry ID required' })
    })

    it('returns fill data for login entry', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_FILL_REQUEST',
        entryId: 'entry-1',
      })) as { success: boolean; fillData: Record<string, unknown> }

      expect(result.success).toBe(true)
      expect(result.fillData.username).toBe('user@example.com')
      expect(result.fillData.password).toBe('secret123')
    })

    it('returns fill data for credit card entry', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_FILL_REQUEST',
        entryId: 'entry-cc',
      })) as { success: boolean; fillData: Record<string, unknown> }

      expect(result.success).toBe(true)
      expect(result.fillData.ccNumber).toBe('4111111111111111')
      expect(result.fillData.ccExp).toBe('12/28')
      expect(result.fillData.ccCvc).toBe('123')
      expect(result.fillData.ccName).toBe('John Doe')
    })

    it('returns error for non-existent entry', async () => {
      const result = await callHandler({
        type: 'AUTOFILL_FILL_REQUEST',
        entryId: 'non-existent',
      })
      expect(result).toEqual({ success: false, error: 'Entry not found' })
    })

    it('handles typed_value as JSON string (double-parse)', async () => {
      const entries: MockEntry[] = [
        {
          id: 'json-string',
          name: 'JSON String Entry',
          entry_type: 'login',
          typed_value: '{"username":"jsonuser","password":"jsonpwd"}' as unknown as Record<
            string,
            unknown
          >,
        },
      ]
      initAutofill(
        createMockVaultApi(entries),
        () => true,
        async () => {},
        async () => {},
      )

      const result = (await callHandler({
        type: 'AUTOFILL_FILL_REQUEST',
        entryId: 'json-string',
      })) as { success: boolean; fillData: Record<string, unknown> }

      expect(result.success).toBe(true)
      expect(result.fillData.username).toBe('jsonuser')
      expect(result.fillData.password).toBe('jsonpwd')
    })
  })

  // ========== AUTOFILL_GET_TOTP ==========

  describe('AUTOFILL_GET_TOTP', () => {
    it('returns error when vault is locked', async () => {
      unlocked = false
      const result = await callHandler({
        type: 'AUTOFILL_GET_TOTP',
        url: 'https://example.com',
      })
      expect(result).toEqual({ success: false, error: 'Vault not unlocked' })
    })

    it('returns TOTP code for entry with totp custom field', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_TOTP',
        url: 'https://example.com',
      })) as { success: boolean; totpCode: string; totpEntryName: string }

      expect(result.success).toBe(true)
      expect(result.totpCode).toBe('123456')
      expect(result.totpEntryName).toBe('TOTP Entry')
    })

    it('returns null when no TOTP field found', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_TOTP',
        url: 'https://other.com',
      })) as { success: boolean; totpCode: string | null }

      expect(result.success).toBe(true)
      expect(result.totpCode).toBeNull()
    })

    it('returns null when no matching entries for URL', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_TOTP',
        url: 'https://unknown.com',
      })) as { success: boolean; totpCode: string | null }

      expect(result.success).toBe(true)
      expect(result.totpCode).toBeNull()
    })
  })

  // ========== AUTOFILL_GET_CREDIT_CARDS ==========

  describe('AUTOFILL_GET_CREDIT_CARDS', () => {
    it('returns error when vault is locked', async () => {
      unlocked = false
      const result = await callHandler({ type: 'AUTOFILL_GET_CREDIT_CARDS' })
      expect(result).toEqual({ success: false, error: 'Vault not unlocked' })
    })

    it('returns credit card entries', async () => {
      const result = (await callHandler({
        type: 'AUTOFILL_GET_CREDIT_CARDS',
      })) as { success: boolean; creditCards: Array<{ entryId: string; name: string }> }

      expect(result.success).toBe(true)
      expect(result.creditCards).toHaveLength(1)
      expect(result.creditCards[0].entryId).toBe('entry-cc')
      expect(result.creditCards[0].name).toBe('My Credit Card')
    })
  })

  // ========== Pending flow (split login) ==========

  describe('pending flow', () => {
    const sender = (tabId: number): chrome.runtime.MessageSender =>
      ({ tab: { id: tabId } }) as chrome.runtime.MessageSender

    it('stores and queries pending flow', async () => {
      // Store
      const storeResult = await callHandler(
        {
          type: 'AUTOFILL_PENDING_FLOW_STORE',
          url: 'https://login.example.com/username',
          entryId: 'entry-1',
          username: 'user@example.com',
        },
        sender(100),
      )
      expect(storeResult).toEqual({ success: true })

      // Query
      const queryResult = (await callHandler(
        {
          type: 'AUTOFILL_PENDING_FLOW_QUERY',
          url: 'https://www.example.com/password',
        },
        sender(100),
      )) as {
        success: boolean
        pendingFlow: { entryId: string; username: string; password: string }
      }

      expect(queryResult.success).toBe(true)
      expect(queryResult.pendingFlow).not.toBeNull()
      expect(queryResult.pendingFlow.entryId).toBe('entry-1')
      expect(queryResult.pendingFlow.username).toBe('user@example.com')
      expect(queryResult.pendingFlow.password).toBe('secret123')
    })

    it('pending flow is non-destructive (available for TOTP step after password step)', async () => {
      await callHandler(
        {
          type: 'AUTOFILL_PENDING_FLOW_STORE',
          url: 'https://example.com',
          entryId: 'entry-1',
          username: 'user@example.com',
        },
        sender(200),
      )

      // First query (password step)
      const firstResult = (await callHandler(
        { type: 'AUTOFILL_PENDING_FLOW_QUERY', url: 'https://example.com' },
        sender(200),
      )) as { success: boolean; pendingFlow: { entryId: string } }

      expect(firstResult.success).toBe(true)
      expect(firstResult.pendingFlow).not.toBeNull()
      expect(firstResult.pendingFlow.entryId).toBe('entry-1')

      // Second query (TOTP step) — flow remains available
      const secondResult = (await callHandler(
        { type: 'AUTOFILL_PENDING_FLOW_QUERY', url: 'https://example.com' },
        sender(200),
      )) as { success: boolean; pendingFlow: { entryId: string } }

      expect(secondResult.success).toBe(true)
      expect(secondResult.pendingFlow).not.toBeNull()
      expect(secondResult.pendingFlow.entryId).toBe('entry-1')
    })

    it('returns null for different domain', async () => {
      await callHandler(
        {
          type: 'AUTOFILL_PENDING_FLOW_STORE',
          url: 'https://example.com',
          entryId: 'entry-1',
          username: 'user@example.com',
        },
        sender(300),
      )

      const result = (await callHandler(
        { type: 'AUTOFILL_PENDING_FLOW_QUERY', url: 'https://other.com' },
        sender(300),
      )) as { success: boolean; pendingFlow: null }

      expect(result.success).toBe(true)
      expect(result.pendingFlow).toBeNull()
    })

    it('returns null after 5-minute timeout', async () => {
      vi.useFakeTimers()
      try {
        await callHandler(
          {
            type: 'AUTOFILL_PENDING_FLOW_STORE',
            url: 'https://example.com',
            entryId: 'entry-1',
            username: 'user@example.com',
          },
          sender(400),
        )

        // Advance time by 5 minutes + 1ms
        vi.advanceTimersByTime(5 * 60 * 1000 + 1)

        const result = (await callHandler(
          { type: 'AUTOFILL_PENDING_FLOW_QUERY', url: 'https://example.com' },
          sender(400),
        )) as { success: boolean; pendingFlow: null }

        expect(result.success).toBe(true)
        expect(result.pendingFlow).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it('returns null when no pending flow exists', async () => {
      const result = (await callHandler(
        { type: 'AUTOFILL_PENDING_FLOW_QUERY', url: 'https://example.com' },
        sender(500),
      )) as { success: boolean; pendingFlow: null }

      expect(result.success).toBe(true)
      expect(result.pendingFlow).toBeNull()
    })

    it('returns error when no tab ID in sender (store)', async () => {
      const result = await callHandler({
        type: 'AUTOFILL_PENDING_FLOW_STORE',
        url: 'https://example.com',
        entryId: 'entry-1',
      })
      expect(result).toEqual({ success: false, error: 'No tab ID' })
    })

    it('returns error when no tab ID in sender (query)', async () => {
      const result = await callHandler({
        type: 'AUTOFILL_PENDING_FLOW_QUERY',
        url: 'https://example.com',
      })
      expect(result).toEqual({ success: false, error: 'No tab ID' })
    })

    it('cleans up pending flow on tab close', async () => {
      await callHandler(
        {
          type: 'AUTOFILL_PENDING_FLOW_STORE',
          url: 'https://example.com',
          entryId: 'entry-1',
          username: 'user@example.com',
        },
        sender(600),
      )

      cleanupPendingFlow(600)

      const result = (await callHandler(
        { type: 'AUTOFILL_PENDING_FLOW_QUERY', url: 'https://example.com' },
        sender(600),
      )) as { success: boolean; pendingFlow: null }

      expect(result.success).toBe(true)
      expect(result.pendingFlow).toBeNull()
    })
  })

  // ========== Unknown message type ==========

  describe('unknown message type', () => {
    it('returns error for unknown type', async () => {
      const result = await callHandler({ type: 'UNKNOWN_TYPE' })
      expect(result).toEqual({
        success: false,
        error: 'Unknown autofill message type: UNKNOWN_TYPE',
      })
    })
  })
})
