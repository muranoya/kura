import React from 'react'
import ReactDOM from 'react-dom/client'
import { initI18n } from './i18n'
import './index.css'
import WebauthnRitualApp from './screens/webauthn/WebauthnRitualApp'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

initI18n().then(() => {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <WebauthnRitualApp />
    </React.StrictMode>,
  )
})
