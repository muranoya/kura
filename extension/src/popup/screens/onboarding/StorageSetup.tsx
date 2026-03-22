import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export default function StorageSetup() {
  const navigate = useNavigate()
  const [storageType, setStorageType] = useState('s3')
  const [endpoint, setEndpoint] = useState('')
  const [bucket, setBucket] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')

  const handleNext = async () => {
    // S3設定を chrome.storage.local に保存
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({
        s3Config: {
          storageType,
          endpoint,
          bucket,
          region,
          accessKeyId,
          secretAccessKey,
        },
      }, () => {
        resolve()
        navigate('/onb/password')
      })
    })
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2>ストレージ接続設定</h2>

      <div style={{ marginTop: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          <input
            type="radio"
            value="s3"
            checked={storageType === 's3'}
            onChange={(e) => setStorageType(e.target.value)}
          />
          {' '}AWS S3
        </label>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          <input
            type="radio"
            value="r2"
            checked={storageType === 'r2'}
            onChange={(e) => setStorageType(e.target.value)}
          />
          {' '}Cloudflare R2
        </label>
        <label style={{ display: 'block', fontSize: '0.875rem' }}>
          <input
            type="radio"
            value="minio"
            checked={storageType === 'minio'}
            onChange={(e) => setStorageType(e.target.value)}
          />
          {' '}MinIO
        </label>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          エンドポイント
        </label>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="例: s3.amazonaws.com"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          バケット名
        </label>
        <input
          type="text"
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          placeholder="例: my-kura-vault"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          リージョン
        </label>
        <input
          type="text"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="例: us-east-1"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          Access Key ID
        </label>
        <input
          type="text"
          value={accessKeyId}
          onChange={(e) => setAccessKeyId(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          Secret Access Key
        </label>
        <input
          type="password"
          value={secretAccessKey}
          onChange={(e) => setSecretAccessKey(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      <button
        className="btn-primary"
        onClick={handleNext}
        style={{ marginTop: '1.5rem', width: '100%' }}
      >
        次へ進む
      </button>
    </div>
  )
}
