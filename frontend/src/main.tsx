import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// index.css first: it declares the cascade-layer order (reset → tw-preflight →
// astryx-base → astryx-theme) before any other stylesheet names a layer.
import './index.css'
import { Theme } from '@astryxdesign/core/theme'
import { cinemaNoirTheme } from './theme'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme theme={cinemaNoirTheme} mode="dark">
      <App />
    </Theme>
  </StrictMode>,
)
