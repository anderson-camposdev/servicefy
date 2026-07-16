import type { TicketFieldDef } from './ticketTableFields'

export type TicketSortDirection = 'asc' | 'desc'
export type TicketSortKind = TicketFieldDef<unknown>['kind']

type TicketValue = string | number | boolean | null | undefined

const textCollator = new Intl.Collator('pt-BR', {
  numeric: true,
  sensitivity: 'base',
})

const isEmpty = (value: TicketValue) => value === null || value === undefined || value === ''

function parseDate(value: TicketValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const brazilian = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  )
  if (brazilian) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = brazilian
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ).getTime()
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function compareNonEmptyValues(a: TicketValue, b: TicketValue, kind: TicketSortKind): number {
  if (kind === 'date') {
    const aDate = parseDate(a)
    const bDate = parseDate(b)
    if (aDate !== null && bDate !== null) return aDate - bDate
  }

  if (kind === 'number' || (typeof a === 'number' && typeof b === 'number')) {
    const aNumber = Number(a)
    const bNumber = Number(b)
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber
  }

  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return textCollator.compare(String(a), String(b))
}

export function compareTicketValues(
  a: TicketValue,
  b: TicketValue,
  kind: TicketSortKind,
  direction: TicketSortDirection,
): number {
  const aEmpty = isEmpty(a)
  const bEmpty = isEmpty(b)
  if (aEmpty || bEmpty) {
    if (aEmpty && bEmpty) return 0
    return aEmpty ? 1 : -1
  }

  const comparison = compareNonEmptyValues(a, b, kind)
  return direction === 'asc' ? comparison : -comparison
}

export function sortTicketRows<T>(
  rows: T[],
  accessor: (row: T) => TicketValue,
  kind: TicketSortKind,
  direction: TicketSortDirection,
): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compareTicketValues(accessor(a.row), accessor(b.row), kind, direction) || a.index - b.index)
    .map(({ row }) => row)
}

export function moveColumn(keys: string[], sourceKey: string, targetKey: string): string[] {
  const sourceIndex = keys.indexOf(sourceKey)
  const targetIndex = keys.indexOf(targetKey)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return keys

  const next = [...keys]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}
