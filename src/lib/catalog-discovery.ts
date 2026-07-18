export function normalizeCatalogSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ')
}
export function matchesCatalogSearch(query: string, ...values: Array<string | null | undefined>): boolean {
  const normalizedQuery = normalizeCatalogSearch(query)
  if (!normalizedQuery) return true

  const searchableText = normalizeCatalogSearch(values.filter(Boolean).join(' '))
  return normalizedQuery.split(' ').every(term => searchableText.includes(term))
}
