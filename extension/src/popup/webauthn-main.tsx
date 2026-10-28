import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import './index.css'
import WebauthnRitualApp from './screens/webauthn/WebauthnRitualApp'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <WebauthnRitualApp />
  </React.StrictMode>,
)
