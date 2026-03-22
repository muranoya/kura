import { useNavigate } from 'react-router-dom'

export default function Welcome() {
  const navigate = useNavigate()

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>kura</h1>
      <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
        サーバ不要、自分一人のための
        <br />
        運用コストゼロのパスワードマネージャー
      </p>
      <button
        className="btn-primary"
        onClick={() => navigate('/onb/storage')}
        style={{ marginTop: '2rem', width: '100%' }}
      >
        次へ進む
      </button>
    </div>
  )
}
