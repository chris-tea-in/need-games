import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/archivo/standard.css'

import { App } from './App.js'
import './styles.css'

const root = document.getElementById('root')

if (root === null) {
  throw new Error('The application root is missing.')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
