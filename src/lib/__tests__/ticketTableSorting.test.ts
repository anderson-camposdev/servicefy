import { describe, expect, it } from 'vitest'
import {
  compareTicketValues,
  moveColumn,
  sortTicketRows,
} from '../ticketTableSorting'

describe('ticketTableSorting', () => {
  it('ordena textos de forma natural e sem diferenciar acentos ou maiusculas', () => {
    const values = ['INC100', 'inc20', 'Árvore', 'abacaxi']

    expect([...values].sort((a, b) => compareTicketValues(a, b, 'text', 'asc')))
      .toEqual(['abacaxi', 'Árvore', 'inc20', 'INC100'])
  })

  it('ordena numeros pelo valor e nao pela representacao textual', () => {
    const values = [100, 9, 42]

    expect([...values].sort((a, b) => compareTicketValues(a, b, 'number', 'desc')))
      .toEqual([100, 42, 9])
  })

  it('ordena datas ISO e brasileiras cronologicamente', () => {
    const values = ['10/06/2026, 18:33:37', '2026-06-06T16:19:37.000Z', '08/06/2026 09:15']

    expect([...values].sort((a, b) => compareTicketValues(a, b, 'date', 'asc')))
      .toEqual(['2026-06-06T16:19:37.000Z', '08/06/2026 09:15', '10/06/2026, 18:33:37'])
  })

  it('mantem valores vazios no fim nas duas direcoes', () => {
    const values = [null, 'Beta', '', 'Alfa']

    expect([...values].sort((a, b) => compareTicketValues(a, b, 'text', 'asc')))
      .toEqual(['Alfa', 'Beta', null, ''])
    expect([...values].sort((a, b) => compareTicketValues(a, b, 'text', 'desc')))
      .toEqual(['Beta', 'Alfa', null, ''])
  })

  it('ordena linhas sem alterar o array recebido', () => {
    const rows = [{ title: 'Zulu' }, { title: 'Alfa' }]

    const sorted = sortTicketRows(rows, row => row.title, 'text', 'asc')

    expect(sorted.map(row => row.title)).toEqual(['Alfa', 'Zulu'])
    expect(rows.map(row => row.title)).toEqual(['Zulu', 'Alfa'])
  })

  it('move uma coluna para a posicao de outra sem perder chaves', () => {
    expect(moveColumn(['id', 'title', 'date', 'company'], 'company', 'title'))
      .toEqual(['id', 'company', 'title', 'date'])
    expect(moveColumn(['id', 'title'], 'missing', 'title')).toEqual(['id', 'title'])
  })
})
