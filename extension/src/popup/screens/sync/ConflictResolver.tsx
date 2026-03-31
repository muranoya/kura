import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/layout/EmptyState'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'

interface Conflict {
  entryId: string
  entryName: string
  conflictType: 'local_modified_remote_deleted' | 'remote_modified_local_deleted' | 'both_modified'
}

export default function ConflictResolver() {
  const navigate = useNavigate()
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [resolutions, setResolutions] = useState<Record<string, 'local' | 'remote'>>({})

  useEffect(() => {
    loadConflicts()
  }, [])

  const loadConflicts = async () => {
    setLoading(true)
    try {
      const response = await new Promise<{
        success?: boolean
        error?: string
        conflicts?: Conflict[]
      }>((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_SYNC_CONFLICTS' }, (response) => resolve(response))
      })
      if (response?.success) {
        setConflicts(response.conflicts || [])
        const initialResolutions: Record<string, 'local' | 'remote'> = {}
        for (const conflict of response.conflicts || []) {
          initialResolutions[conflict.entryId] = 'local'
        }
        setResolutions(initialResolutions)
      }
    } catch (err) {
      console.error('Failed to load conflicts:', err)
    } finally {
      setLoading(false)
    }
  }

  const getConflictDescription = (type: Conflict['conflictType']): string => {
    switch (type) {
      case 'local_modified_remote_deleted':
        return 'ローカルで編集、リモートで削除'
      case 'remote_modified_local_deleted':
        return 'リモートで編集、ローカルで削除'
      case 'both_modified':
        return '両方で編集'
    }
  }

  const handleResolve = async () => {
    setResolving(true)
    try {
      const response = await new Promise<{
        success?: boolean
        error?: string
        conflicts?: Conflict[]
      }>((resolve) => {
        chrome.runtime.sendMessage({ type: 'RESOLVE_SYNC_CONFLICTS', resolutions }, (response) =>
          resolve(response),
        )
      })

      if (response?.success) {
        navigate('/sync')
      } else {
        alert(response?.error || 'コンフリクト解決に失敗しました')
      }
    } catch (err) {
      alert(String(err))
    } finally {
      setResolving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-text-muted">読み込み中...</div>
      </div>
    )
  }

  if (conflicts.length === 0) {
    return (
      <div className="h-full overflow-y-auto pb-20 flex flex-col">
        <PageHeader title="コンフリクト解決" showBackButton={true} />
        <div className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            title="解決するコンフリクトはありません"
            description="すべてのコンフリクトが解決されました"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader title="コンフリクト解決" showBackButton={true} />

      <div className="p-4 space-y-4">
        <div className="text-sm text-text-secondary">
          複数のデバイスで同時に変更されました。以下のエントリについて、どちらの変更を採用するか選択してください。
        </div>

        {/* コンフリクト一覧 */}
        <div className="space-y-2">
          {conflicts.map((conflict) => (
            <Card key={conflict.entryId}>
              <CardHeader className="px-3 py-2">
                <div>
                  <CardTitle className="text-sm font-medium">{conflict.entryName}</CardTitle>
                  <p className="text-sm text-text-muted mt-1">
                    {getConflictDescription(conflict.conflictType)}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-2 space-y-2">
                <div className="space-y-1.5">
                  {/* ローカル版 */}
                  <label className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer hover:bg-bg-elevated">
                    <input
                      type="radio"
                      name={`conflict-${conflict.entryId}`}
                      value="local"
                      checked={resolutions[conflict.entryId] === 'local'}
                      onChange={() =>
                        setResolutions({ ...resolutions, [conflict.entryId]: 'local' })
                      }
                      className="w-4 h-4"
                    />
                    <div className="flex-1 text-sm">
                      <p className="font-medium text-text-primary">ローカル版</p>
                      <p className="text-text-muted">このデバイスの変更を使用</p>
                    </div>
                  </label>

                  {/* リモート版 */}
                  <label className="flex items-center gap-2 p-2 rounded-md border border-border cursor-pointer hover:bg-bg-elevated">
                    <input
                      type="radio"
                      name={`conflict-${conflict.entryId}`}
                      value="remote"
                      checked={resolutions[conflict.entryId] === 'remote'}
                      onChange={() =>
                        setResolutions({ ...resolutions, [conflict.entryId]: 'remote' })
                      }
                      className="w-4 h-4"
                    />
                    <div className="flex-1 text-sm">
                      <p className="font-medium text-text-primary">リモート版</p>
                      <p className="text-text-muted">他のデバイスの変更を使用</p>
                    </div>
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* アクションボタン */}
        <div className="space-y-2">
          <Button onClick={handleResolve} disabled={resolving} className="w-full text-sm" size="sm">
            {resolving ? '解決中...' : '解決'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate('/sync')}
            disabled={resolving}
            className="w-full text-sm"
            size="sm"
          >
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  )
}
