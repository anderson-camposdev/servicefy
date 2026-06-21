import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TenantProvider } from './tenant'
import { AuthProvider } from './auth'
import { ThemeProvider, ToastProvider } from './context'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TenantProvider>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </TenantProvider>
  </StrictMode>,
)
