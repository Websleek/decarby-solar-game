import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { VoucherTermsApp } from './VoucherTermsApp'
import './voucher-terms.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root for voucher terms page.')
}

createRoot(root).render(
  <StrictMode>
    <VoucherTermsApp />
  </StrictMode>,
)
