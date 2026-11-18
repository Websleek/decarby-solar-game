import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StaffVerificationApp } from './StaffVerificationApp'
import './staffVerification.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

createRoot(root).render(
  <StrictMode>
    <StaffVerificationApp />
  </StrictMode>,
)
