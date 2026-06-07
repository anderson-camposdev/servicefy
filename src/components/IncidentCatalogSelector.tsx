// ============================================================
// IncidentCatalogSelector — Seletor em Cascata para Abertura de Incidentes
// Item → Sub-item → Sintoma (com SLA automático exibido ao usuário)
// ============================================================

import React from 'react'
import type { IncidentCatalogItem, IncidentCatalogSubitem, IncidentCatalogSymptom } from '../types'
import type { IncidentCatalogCascadeEntry, IncidentCatalogSelection, ComputedSLA } from '../hooks/useIncidentCatalog'

interface IncidentCatalogSelectorProps {
  catalog:           IncidentCatalogCascadeEntry[]
  selection:         IncidentCatalogSelection
  computedSla:       ComputedSLA | null
  availableSubitems: Array<IncidentCatalogSubitem & { symptoms: IncidentCatalogSymptom[] }>
  availableSymptoms: IncidentCatalogSymptom[]
  loading:           boolean
  error:             string | null
  onSelectItem:      (item: IncidentCatalogItem | null) => void
  onSelectSubitem:   (subitem: IncidentCatalogSubitem | null) => void
  onSelectSymptom:   (symptom: IncidentCatalogSymptom | null) => void
  primaryColor?:     string
}

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h${m}min`
}


export const IncidentCatalogSelector: React.FC<IncidentCatalogSelectorProps> = ({
  catalog,
  selection,
  computedSla,
  availableSubitems,
  availableSymptoms,
  loading,
  error,
  onSelectItem,
  onSelectSubitem,
  onSelectSymptom,
  primaryColor = '#2563EB',
}) => {
  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>
        <span style={{ fontSize: '22px' }}>⏳</span>
        <p style={{ marginTop: '8px', fontSize: '14px' }}>Carregando catálogo…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '16px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '14px' }}>
        ⚠️ Erro ao carregar catálogo: {error}
      </div>
    )
  }

  // Se não há catálogo configurado, exibe aviso amigável
  if (catalog.length === 0) {
    return (
      <div style={{
        padding: '20px', borderRadius: '10px', background: '#F8FAFC',
        border: '1px dashed #CBD5E1', textAlign: 'center', color: '#64748B', fontSize: '14px'
      }}>
        📋 Nenhum item de catálogo configurado para esta empresa.<br />
        <span style={{ fontSize: '12px', color: '#94A3B8' }}>Acesse o Painel Admin para cadastrar o catálogo de incidentes.</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* ─── NÍVEL 1: Item ─────────────────────────────────────── */}
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
          📁 Categoria do Incidente <span style={{ color: '#EF4444' }}>*</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
          {catalog.map(({ item }) => {
            const isSelected = selection.item?.id === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(isSelected ? null : item)}
                style={{
                  display:       'flex',
                  alignItems:    'center',
                  gap:           '8px',
                  padding:       '10px 12px',
                  borderRadius:  '8px',
                  border:        `2px solid ${isSelected ? primaryColor : '#E5E7EB'}`,
                  background:    isSelected ? `${primaryColor}15` : '#FFFFFF',
                  cursor:        'pointer',
                  textAlign:     'left',
                  fontSize:      '13px',
                  fontWeight:    isSelected ? '600' : '400',
                  color:         isSelected ? primaryColor : '#374151',
                  transition:    'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
                <span style={{ lineHeight: '1.2' }}>{item.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── NÍVEL 2: Sub-item (aparece ao selecionar Item) ────── */}
      {selection.item && (
        <div style={{ animation: 'fadeIn 0.2s ease' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
            📂 Classificação <span style={{ color: '#EF4444' }}>*</span>
          </label>
          {availableSubitems.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#9CA3AF' }}>Nenhuma classificação cadastrada para este item.</p>
          ) : (
            <select
              value={selection.subitem?.id ?? ''}
              onChange={e => {
                const found = availableSubitems.find(s => s.id === e.target.value)
                onSelectSubitem(found ?? null)
              }}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: `2px solid ${selection.subitem ? primaryColor : '#E5E7EB'}`,
                background: '#FFFFFF', fontSize: '14px', color: '#1F2937',
                outline: 'none', cursor: 'pointer', appearance: 'auto',
              }}
            >
              <option value="">— Selecione a classificação —</option>
              {availableSubitems.map(sub => (
                <option key={sub.id} value={sub.id}>{sub.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ─── NÍVEL 3: Sintoma (aparece ao selecionar Sub-item) ── */}
      {selection.subitem && (
        <div style={{ animation: 'fadeIn 0.2s ease' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
            🔍 Sintoma relatado <span style={{ color: '#EF4444' }}>*</span>
          </label>
          {availableSymptoms.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#9CA3AF' }}>Nenhum sintoma cadastrado para esta classificação.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {availableSymptoms.map(symptom => {
                const isSelected = selection.symptom?.id === symptom.id
                return (
                  <button
                    key={symptom.id}
                    type="button"
                    onClick={() => onSelectSymptom(isSelected ? null : symptom)}
                    style={{
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'space-between',
                      padding:        '10px 14px',
                      borderRadius:   '8px',
                      border:         `2px solid ${isSelected ? primaryColor : '#E5E7EB'}`,
                      background:     isSelected ? `${primaryColor}12` : '#FAFAFA',
                      cursor:         'pointer',
                      textAlign:      'left',
                      fontSize:       '13px',
                      fontWeight:     isSelected ? '600' : '400',
                      color:          isSelected ? primaryColor : '#374151',
                      transition:     'all 0.15s ease',
                    }}
                  >
                    <span>{symptom.name}</span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{
                        fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                        background: '#DBEAFE', color: '#1D4ED8', fontWeight: '600',
                      }}>
                        Resp: {formatMins(symptom.slaResponseMins)}
                      </span>
                      <span style={{
                        fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                        background: '#D1FAE5', color: '#065F46', fontWeight: '600',
                      }}>
                        Sol: {formatMins(symptom.slaResolutionMins)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── SLA Calculado (aparece ao selecionar Sintoma) ─────── */}
      {computedSla && (
        <div style={{
          marginTop: '4px',
          borderRadius: '10px',
          border: '2px solid #10B981',
          background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
          padding: '14px 16px',
          animation: 'fadeIn 0.25s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '16px' }}>✅</span>
            <strong style={{ fontSize: '13px', color: '#065F46' }}>SLA Aplicado Automaticamente</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ background: '#FFFFFF', borderRadius: '8px', padding: '10px', border: '1px solid #A7F3D0' }}>
              <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ⚡ Tempo de Resposta
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#1D4ED8', marginTop: '4px' }}>
                {formatMins(computedSla.responseMins)}
              </div>
              {computedSla.responseDeadline && (
                <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                  até {computedSla.responseDeadline.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
            <div style={{ background: '#FFFFFF', borderRadius: '8px', padding: '10px', border: '1px solid #A7F3D0' }}>
              <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🎯 Tempo de Solução
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#059669', marginTop: '4px' }}>
                {formatMins(computedSla.resolutionMins)}
              </div>
              {computedSla.resolutionDeadline && (
                <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                  até {computedSla.resolutionDeadline.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#374151' }}>Prioridade sugerida:</span>
            <span style={{
              fontSize: '12px', padding: '3px 8px', borderRadius: '6px', fontWeight: '700',
              background: computedSla.priority.includes('P1') ? '#FEE2E2' :
                          computedSla.priority.includes('P2') ? '#FFEDD5' :
                          computedSla.priority.includes('P3') ? '#FEF3C7' : '#F1F5F9',
              color:      computedSla.priority.includes('P1') ? '#DC2626' :
                          computedSla.priority.includes('P2') ? '#EA580C' :
                          computedSla.priority.includes('P3') ? '#D97706' : '#64748B',
            }}>
              {computedSla.priority}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default IncidentCatalogSelector
