import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('root')

if (root === null) {
  throw new Error('The application root is missing.')
}

createRoot(root).render(
  <StrictMode>
    <p>Need Games closed beta is loading.</p>
  </StrictMode>,
)
