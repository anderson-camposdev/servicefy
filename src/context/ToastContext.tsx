import React, { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void
    error: (message: string) => void
    info: (message: string) => void
    warning: (message: string) => void
  }
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, message, type }])
    
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = React.useMemo(() => ({
    success: (msg: string) => addToast(msg, 'success'),
    error: (msg: string) => addToast(msg, 'error'),
    info: (msg: string) => addToast(msg, 'info'),
    warning: (msg: string) => addToast(msg, 'warning'),
  }), [addToast])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      
      {/* Toast Portal Container */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          let icon = <Info className="w-5 h-5" />
          let themeClasses = 'bg-white border-slate-200 text-slate-800'

          if (t.type === 'success') {
            icon = <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            themeClasses = 'bg-emerald-50/95 border-emerald-200 text-emerald-900 shadow-emerald-100/40'
          } else if (t.type === 'error') {
            icon = <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            themeClasses = 'bg-red-50/95 border-red-200 text-red-900 shadow-red-100/40'
          } else if (t.type === 'warning') {
            icon = <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            themeClasses = 'bg-amber-50/95 border-amber-200 text-amber-900 shadow-amber-100/40'
          } else if (t.type === 'info') {
            icon = <Info className="w-5 h-5 text-indigo-500 shrink-0" />
            themeClasses = 'bg-indigo-50/95 border-indigo-200 text-indigo-900 shadow-indigo-100/40'
          }

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-xl backdrop-blur-md transition-all duration-300 transform translate-y-0 opacity-100 animate-slide-in-right ${themeClasses}`}
              style={{
                animation: 'slideInRight 0.25s ease-out forwards'
              }}
            >
              {icon}
              <div className="flex-1 text-xs font-semibold leading-relaxed">
                {t.message}
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded-lg hover:bg-slate-100/50 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Embedded slide-in animation styles */}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%) translateY(10px);
            opacity: 0;
          }
          to {
            transform: translateX(0) translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
