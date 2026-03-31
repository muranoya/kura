import { createContext, useContext, useState } from 'react'

interface SyncContextValue {
  syncVersion: number
  notifySynced: () => void
}

const SyncContext = createContext<SyncContextValue>({
  syncVersion: 0,
  notifySynced: () => {},
})

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncVersion, setSyncVersion] = useState(0)
  const notifySynced = () => setSyncVersion((v) => v + 1)
  return (
    <SyncContext.Provider value={{ syncVersion, notifySynced }}>{children}</SyncContext.Provider>
  )
}

export function useSyncVersion() {
  return useContext(SyncContext).syncVersion
}

export function useNotifySynced() {
  return useContext(SyncContext).notifySynced
}
