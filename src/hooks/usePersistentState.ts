import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * useState que persiste no localStorage (rascunho imune a reload forçado
 * do navegador / Tab Discarding). `clear()` remove a chave e zera o estado.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  isValid?: (value: unknown) => boolean,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const initialRef = useRef(initial)
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return initial

      const storedValue = JSON.parse(raw) as unknown
      return !isValid || isValid(storedValue) ? (storedValue as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)) } catch { /* quota/privado — ignora */ }
  }, [key, state])

  const clear = useCallback(() => {
    try { localStorage.removeItem(key) } catch { /* ignora */ }
    setState(initialRef.current)
  }, [key])

  return [state, setState, clear]
}
