// ============================================================
// useLicense — Controle de Licenças Concorrentes por WebSocket
// Mantém sessão ativa via heartbeat a cada 30s e libera no logout
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { licenseService } from '../lib/services'

export interface LicenseSession {
  sessionToken: string
  companyId: string
  userId: string
  connectedAt: string
}

interface UseLicenseReturn {
  session: LicenseSession | null
  licenseAvailable: boolean
  licenseStatus: { used: number; total: number; status: string } | null
  startSession: (companyId: string, userId: string) => Promise<{ success: boolean; error?: string }>
  endSession: () => Promise<void>
  isSessionActive: boolean
}

export function useLicense(): UseLicenseReturn {
  const [session, setSession]             = useState<LicenseSession | null>(null)
  const [licenseAvailable, setAvailable]  = useState<boolean>(true)
  const [licenseStatus, setLicenseStatus] = useState<{ used: number; total: number; status: string } | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionRef   = useRef<LicenseSession | null>(null)

  // Sincronizar ref com state para uso no cleanup/unmount
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // Heartbeat: mantém a sessão viva a cada 30 segundos
  const startHeartbeat = useCallback((token: string) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(async () => {
      const alive = await licenseService.heartbeat(token)
      if (!alive) {
        // Sessão expirou no servidor — limpar localmente
        console.warn('[useLicense] Heartbeat falhou — sessão encerrada pelo servidor')
        setSession(null)
        clearInterval(heartbeatRef.current!)
      }
    }, 30_000) // 30 segundos
  }, [])

  // Iniciar sessão após login
  const startSession = useCallback(async (
    companyId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> => {
    // 1. Verificar disponibilidade de licença
    const availability = await licenseService.checkAvailability(companyId)
    setLicenseStatus({ used: availability.used, total: availability.total, status: availability.status })

    if (!availability.available) {
      setAvailable(false)
      return {
        success: false,
        error:   `Limite de licenças atingido (${availability.used}/${availability.total} conexões ativas). Contate o administrador.`
      }
    }

    // 2. Gerar token único para esta sessão
    const sessionToken = licenseService.generateSessionToken()

    // 3. Registrar no banco
    const result = await licenseService.registerSession(
      companyId,
      userId,
      sessionToken,
      {
        userAgent:  navigator.userAgent,
        deviceType: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      }
    )

    if (!result.success) {
      return { success: false, error: result.error }
    }

    // 4. Persistir sessão no state
    const newSession: LicenseSession = {
      sessionToken,
      companyId,
      userId,
      connectedAt: new Date().toISOString(),
    }
    setSession(newSession)
    setAvailable(true)

    // 5. Iniciar heartbeat
    startHeartbeat(sessionToken)

    return { success: true }
  }, [startHeartbeat])

  // Encerrar sessão no logout
  const endSession = useCallback(async () => {
    const current = sessionRef.current
    if (!current) return

    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    await licenseService.releaseSession(current.sessionToken, 'logout')
    setSession(null)
  }, [])

  // Cleanup: liberar sessão ao desmontar componente (fechar aba)
  useEffect(() => {
    const handleUnload = () => {
      const current = sessionRef.current
      if (current) {
        // navigator.sendBeacon para garantir entrega mesmo ao fechar aba
        licenseService.releaseSession(current.sessionToken, 'browser_close')
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [])

  return {
    session,
    licenseAvailable,
    licenseStatus,
    startSession,
    endSession,
    isSessionActive: session !== null,
  }
}
