// ============================================================
// RequestCatalogSelector — Seletor em Cascata para Abertura de Requisições
// Item → Sub-item (com badge de "Aprovação do Gestor" quando aplicável)
// ============================================================

import React from 'react'
import type { RequestCatalogItem, RequestCatalogSubitem } from '../types'
import type { RequestCatalogCascadeEntry, RequestCatalogSelection } from '../hooks/useRequestCatalog'

interface RequestCatalogSelectorProps {
  catalog:           RequestCatalogCascadeEntry[]
  selection:         RequestCatalogSelection
  availableSubitems: RequestCatalogSubitem[]
  requiresApproval:  boolean
  loading:           boolean
  error:             string | null
  onSelectItem:      (item: RequestCatalogItem | null) => void
  onSelectSubitem:   (subitem: RequestCatalogSubitem | null) => void
  primaryColor?:     string
}

export const RequestCatalogSelector: React.FC<RequestCatalogSelectorProps> = ({
  catalog,
  selection,
  availableSubitems,
  requiresApproval,
  loading,
  error,
  onSelectItem,
  onSelectSubitem,
  primaryColor = '#7C3AED',
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

  if (catalog.length === 0) {
    return (
      <div style={{
        padding: '20px', borderRadius: '10px', background: '#F8FAFC',
        border: '1px dashed #CBD5E1', textAlign: 'center', color: '#64748B', fontSize: '14px'
      }}>
        📋 Nenhum item de catálogo de serviços configurado.<br />
        <span style={{ fontSize: '12px', color: '#94A3B8' }}>Acesse o Painel Admin para cadastrar o catálogo de requisições.</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* ─── NÍVEL 1: Item ─────────────────────────────────────── */}
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
          📦 Tipo de Serviço <span style={{ color: '#EF4444' }}>*</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
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
                  gap:           '10px',
                  padding:       '12px 14px',
                  borderRadius:  '10px',
                  border:        `2px solid ${isSelected ? primaryColor : '#E5E7EB'}`,
                  background:    isSelected ? `${primaryColor}12` : '#FFFFFF',
                  cursor:        'pointer',
                  textAlign:     'left',
                  fontSize:      '13px',
                  fontWeight:    isSelected ? '600' : '400',
                  color:         isSelected ? primaryColor : '#374151',
                  transition:    'all 0.15s ease',
                  boxShadow:     isSelected ? `0 0 0 3px ${primaryColor}20` : '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <span style={{ fontSize: '20px', flexShrink: 0 }}>{item.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: isSelected ? '700' : '500' }}>{item.name}</div>
                  {item.description && (
                    <div style={{
                      fontSize: '11px', color: '#6B7280', marginTop: '2px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.description}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── NÍVEL 2: Sub-item (aparece ao selecionar Item) ────── */}
      {selection.item && (
        <div style={{ animation: 'fadeIn 0.2s ease' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
            📄 Item Específico <span style={{ color: '#EF4444' }}>*</span>
          </label>
          {availableSubitems.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#9CA3AF' }}>Nenhum item configurado para esta categoria.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {availableSubitems.map(subitem => {
                const isSelected = selection.subitem?.id === subitem.id
                return (
                  <button
                    key={subitem.id}
                    type="button"
                    onClick={() => onSelectSubitem(isSelected ? null : subitem)}
                    style={{
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'space-between',
                      padding:        '12px 16px',
                      borderRadius:   '10px',
                      border:         `2px solid ${isSelected ? primaryColor : '#E5E7EB'}`,
                      background:     isSelected ? `${primaryColor}0F` : '#FAFAFA',
                      cursor:         'pointer',
                      textAlign:      'left',
                      fontSize:       '14px',
                      fontWeight:     isSelected ? '600' : '400',
                      color:          isSelected ? primaryColor : '#374151',
                      transition:     'all 0.15s ease',
                    }}
                  >
                    {/* Informações do sub-item */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: isSelected ? '700' : '500' }}>{subitem.name}</div>
                      {subitem.description && (
                        <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                          {subitem.description}
                        </div>
                      )}
                    </div>

                    {/* Badges direita */}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: '12px', flexShrink: 0 }}>
                      {/* Prazo estimado */}
                      {subitem.estimatedDeliveryDays > 0 && (
                        <span style={{
                          fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
                          background: '#EFF6FF', color: '#1D4ED8', fontWeight: '600',
                        }}>
                          📅 {subitem.estimatedDeliveryDays}d
                        </span>
                      )}
                      {/* Custo */}
                      {subitem.cost && (
                        <span style={{
                          fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
                          background: '#F0FDF4', color: '#15803D', fontWeight: '600',
                        }}>
                          💰 {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: subitem.currency ?? 'BRL' }).format(subitem.cost)}
                        </span>
                      )}
                      {/* Badge de aprovação obrigatória */}
                      {subitem.requiresManagerApproval && (
                        <span style={{
                          display:       'inline-flex',
                          alignItems:    'center',
                          gap:           '4px',
                          fontSize:      '11px',
                          padding:       '3px 8px',
                          borderRadius:  '6px',
                          fontWeight:    '700',
                          background:    '#FEF3C7',
                          color:         '#B45309',
                          border:        '1px solid #F59E0B',
                          whiteSpace:    'nowrap',
                        }}>
                          ✉️ Aprovação Gestor
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Banner de Aprovação (ao selecionar sub-item com flag) */}
      {requiresApproval && selection.subitem && (
        <div style={{
          borderRadius: '10px',
          border: '2px solid #F59E0B',
          background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
          padding: '14px 16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-start',
          animation: 'fadeIn 0.25s ease',
        }}>
          <span style={{ fontSize: '22px', flexShrink: 0 }}>✉️</span>
          <div>
            <strong style={{ fontSize: '13px', color: '#92400E' }}>Aprovação do Gestor Obrigatória</strong>
            <p style={{ fontSize: '12px', color: '#78350F', marginTop: '4px', lineHeight: '1.5' }}>
              Este item requer aprovação do seu gestor direto via e-mail antes de ser iniciado.
              Após a abertura da solicitação, um e-mail de aprovação será enviado automaticamente.
              O prazo de atendimento só começa após a aprovação.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default RequestCatalogSelector
