// ============================================================
// useRealtimeNotifications — Fase 16: notificações in-app reativas
//
// Estratégia de performance (ver contexto completo no PR/commit):
//   - Um único canal Realtime por sessão de usuário — chame este hook uma
//     única vez, em nível alto (perto do contexto de sessão), nunca por
//     componente, para não abrir canais duplicados sobre o mesmo WebSocket.
//   - Filtro no servidor (`user_id=eq.<profileId>`), não no cliente — o
//     Postgres só notifica o socket quando a linha bate o filtro.
//   - Fetch inicial e subscribe em paralelo, não em série, para nunca travar
//     em "carregando" caso o WebSocket falhe.
//   - Só assina INSERT; "marcar como lida" é escrita otimista local + UPDATE
//     direto, sem round-trip pelo canal.
//   - Cleanup real no unmount via supabase.removeChannel (não só unsubscribe).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { NotificationRow } from '../lib/database.types'

export interface UseRealtimeNotificationsResult {
  notifications: NotificationRow[]
  unreadCount: number
  loading: boolean
  error: string
  markAsRead: (notificationId: string) => Promise<void>
}

const RECENT_LIMIT = 20

export function useRealtimeNotifications(
  profileId: string | null,
  companyId: string | null,
): UseRealtimeNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profileId || !companyId) {
      setNotifications([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    const channel = supabase
      .channel(`notifications:${profileId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profileId}` },
        (payload: RealtimePostgresInsertPayload<NotificationRow>) => {
          if (cancelled) return
          setNotifications(current => [payload.new, ...current].slice(0, RECENT_LIMIT))
        },
      )
      .subscribe()

    const loadInitial = async () => {
      const { data, error: loadError } = await supabase
        .from('notifications')
        .select('id,company_id,user_id,title,message,type,read,linked_ticket_id,linked_ticket_type,link,created_at')
        .eq('user_id', profileId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT)

      if (cancelled) return
      if (loadError) {
        setError(loadError.message)
      } else {
        setNotifications((data ?? []) as NotificationRow[])
      }
      setLoading(false)
    }

    void loadInitial()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [profileId, companyId])

  const markAsRead = useCallback(async (notificationId: string) => {
    setNotifications(current =>
      current.map(notification => (notification.id === notificationId ? { ...notification, read: true } : notification)),
    )

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)

    if (updateError) {
      setError(updateError.message)
    }
  }, [])

  const unreadCount = notifications.filter(notification => !notification.read).length

  return { notifications, unreadCount, loading, error, markAsRead }
}
