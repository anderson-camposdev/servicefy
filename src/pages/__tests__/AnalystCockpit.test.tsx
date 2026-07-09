import { describe, it, expect } from 'vitest'
import { calculateSlaState } from '../AnalystCockpit'

describe('calculateSlaState', () => {
  const deadline = '2026-07-09T18:00:00.000Z'
  const targetTime = new Date(deadline).getTime()
  const createdAt = '2026-07-09T14:00:00.000Z' // 4 horas antes do deadline

  it('deve retornar "Sem prazo definido" se o deadline for nulo', () => {
    const res = calculateSlaState(null, null, false, Date.now(), null)
    expect(res.status).toBe('none')
    expect(res.text).toBe('Sem prazo definido')
    expect(res.showDeadline).toBe(false)
  })

  it('deve retornar cumprido se achievedAt estiver definido', () => {
    const achievedAt = '2026-07-09T17:30:00.000Z'
    const res = calculateSlaState(deadline, achievedAt, false, targetTime, createdAt)
    expect(res.status).toBe('fulfilled')
    expect(res.text).toContain('Cumprido em')
    expect(res.showDeadline).toBe(false)
  })

  it('deve retornar pausado com tempo restante correto se pausedAt estiver definido', () => {
    const pausedAt = '2026-07-09T17:00:00.000Z' // 1 hora antes do deadline
    const res = calculateSlaState(deadline, null, false, targetTime, createdAt, pausedAt)
    expect(res.status).toBe('paused')
    expect(res.text).toBe('Pausado — 1h 0m restante')
    expect(res.showDeadline).toBe(false)
  })

  it('deve calcular corretamente com clock offset positivo (relógio do cliente atrasado)', () => {
    // Relógio real do servidor: 16:50:00
    // Relógio do cliente (Date.now()): 16:40:00 (10 min atrasado)
    // Offset calculado: +10 min
    const serverTime = new Date('2026-07-09T16:50:00.000Z').getTime()
    const clientTime = new Date('2026-07-09T16:40:00.000Z').getTime()
    const offset = serverTime - clientTime // +600.000 ms

    // Sem offset, o cliente calcula nowTime = 16:40:00 (restam 1h 20m)
    // Com offset, o cliente calcula o nowTime correto = clientTime + offset (16:50:00)
    // Tempo restante correto deve ser 1h 10m (70 min)
    const nowTime = clientTime + offset

    const res = calculateSlaState(deadline, null, false, nowTime, createdAt)
    expect(res.status).toBe('normal')
    expect(res.text).toBe('1h 10m restante')
    expect(res.showDeadline).toBe(true)
  })

  it('deve calcular corretamente com clock offset negativo (relógio do cliente adiantado)', () => {
    // Relógio real do servidor: 16:50:00
    // Relógio do cliente (Date.now()): 17:00:00 (10 min adiantado)
    // Offset calculado: -10 min
    const serverTime = new Date('2026-07-09T16:50:00.000Z').getTime()
    const clientTime = new Date('2026-07-09T17:00:00.000Z').getTime()
    const offset = serverTime - clientTime // -600.000 ms

    // Sem offset, o cliente calcula nowTime = 17:00:00 (restam 1h - warning)
    // Com offset, o cliente calcula o nowTime correto = clientTime + offset (16:50:00)
    // Tempo restante correto deve ser 1h 10m (70 min)
    const nowTime = clientTime + offset

    const res = calculateSlaState(deadline, null, false, nowTime, createdAt)
    expect(res.status).toBe('normal')
    expect(res.text).toBe('1h 10m restante')
    expect(res.showDeadline).toBe(true)
  })

  it('deve retornar warning se o tempo restante for menor ou igual a 25% da duração total', () => {
    // Duração total: 4h. 25% do prazo = 1h.
    // 59 minutos restante (dentro do aviso)
    const nowTime = targetTime - (59 * 60 * 1000)
    const res = calculateSlaState(deadline, null, false, nowTime, createdAt)
    expect(res.status).toBe('warning')
    expect(res.text).toBe('59m 0s restante')
    expect(res.showDeadline).toBe(true)
  })

  it('deve retornar estourado se o prazo expirou ou isBreached for verdadeiro', () => {
    const nowTime = targetTime + (10 * 60 * 1000) // 10 min de estouro
    const res = calculateSlaState(deadline, null, false, nowTime, createdAt)
    expect(res.status).toBe('breached')
    expect(res.text).toBe('Estourado há 10m 0s')
    expect(res.showDeadline).toBe(false)
  })
})
