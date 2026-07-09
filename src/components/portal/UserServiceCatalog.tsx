import CatalogIcon from '../../pages/CatalogIcon'
import type {
  CatalogCategoryRow, CatalogServiceRow, CatalogServiceSymptomRow,
  RequestCategoryRow, RequestSubcategoryRow, RequestItemRow, DepartmentRow
} from '../../lib/database.types'

interface PortalConfig {
  cardLayout: 'grid' | 'list'
  companyName: string
  portalTitle: string
  browseCats: any[]
  incCats: any[]
  reqCats: any[]
  portalButtons?: {
    incident_label?: string
    incident_desc?: string
    incident_emoji?: string
    request_label?: string
    request_desc?: string
    request_emoji?: string
  }
}

interface UserServiceCatalogProps {
  screen: string
  catalogLoading: boolean
  visibleIncCategories: CatalogCategoryRow[]
  visibleReqCategories: RequestCategoryRow[]
  services: CatalogServiceRow[]
  serviceSymptoms: CatalogServiceSymptomRow[]
  reqSubcategories: RequestSubcategoryRow[]
  reqItems: RequestItemRow[]
  selIncCat: any | null
  selReqCat: any | null
  dbSelIncCat: CatalogCategoryRow | null
  dbSelIncService: CatalogServiceRow | null
  dbSelReqCat: RequestCategoryRow | null
  dbSelReqSubcat: RequestSubcategoryRow | null
  catalogIconSize: number
  catalogFontSize: string
  customIconBg?: string
  customPillBg?: string
  customPillColor?: string
  selDept: DepartmentRow | null
  config: PortalConfig
  categories: CatalogCategoryRow[]
  reqCategories: RequestCategoryRow[]
  onSelectIncCat: (c: CatalogCategoryRow) => void
  onSelectLegacyIncCat: (c: any) => void
  onSelectIncService: (s: CatalogServiceRow) => void
  onSelectIncSymptom: (s: CatalogServiceSymptomRow) => void
  onSelectLegacyIncSymptom: (s: string) => void
  onSelectReqCat: (c: RequestCategoryRow) => void
  onSelectLegacyReqCat: (c: any) => void
  onSelectReqSubcat: (s: RequestSubcategoryRow) => void
  onSelectLegacyReqSubcatOthers: () => void
  onSelectReqItem: (it: RequestItemRow) => void
  onSelectLegacyReqItem: (it: string) => void
}

const OTHERS_SUBCAT_ID = '__others__'

function hexToRgba(hex: string, alpha: number): string {
  const clean = (hex.startsWith('#') ? hex.slice(1) : hex).padEnd(6, '0')
  const r = parseInt(clean.slice(0,2), 16) || 16
  const g = parseInt(clean.slice(2,4), 16) || 185
  const b = parseInt(clean.slice(4,6), 16) || 129
  return `rgba(${r},${g},${b},${alpha})`
}

export function UserServiceCatalog({
  screen,
  catalogLoading,
  visibleIncCategories,
  visibleReqCategories,
  services,
  serviceSymptoms,
  reqSubcategories,
  reqItems,
  selIncCat,
  selReqCat,
  dbSelIncCat,
  dbSelIncService,
  dbSelReqCat,
  dbSelReqSubcat,
  catalogIconSize,
  catalogFontSize,
  customIconBg,
  customPillBg,
  customPillColor,
  selDept,
  config,
  categories,
  reqCategories,
  onSelectIncCat,
  onSelectLegacyIncCat,
  onSelectIncService,
  onSelectIncSymptom,
  onSelectLegacyIncSymptom,
  onSelectReqCat,
  onSelectLegacyReqCat,
  onSelectReqSubcat,
  onSelectLegacyReqSubcatOthers,
  onSelectReqItem,
  onSelectLegacyReqItem,
}: UserServiceCatalogProps) {
  return (
    <>
      {/* INC: Categorias */}
      {screen === 'inc-cats' && (
        <div>
          <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>Qual área está com problema?</h2>
          <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione a categoria mais próxima do que está acontecendo.</p>

          {catalogLoading ? (
            <div style={{ padding:20, color:'#94a3b8', font:'500 14px sans-serif', textAlign:'center' }}>Carregando categorias...</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {visibleIncCategories.length > 0 ? (
                visibleIncCategories.map(c => {
                  const catServices = services.filter(service => service.category_id === c.id)
                  return (
                    <button key={c.id} onClick={() => onSelectIncCat(c)}
                      style={{
                        display:'flex',
                        alignItems:'center',
                        gap:14,
                        padding:18,
                        background: customPillBg || '#fff',
                        border: customPillBg ? `1.5px solid ${customPillBg}` : '1.5px solid #e2e8f0',
                        borderRadius:14,
                        textAlign:'left',
                        boxShadow:'0 1px 2px rgba(15,23,42,.04)',
                        cursor:'pointer',
                        transition:'transform .15s,box-shadow .15s'
                      }}>
                      <CatalogIcon icon={c.icon} name={c.name} size={catalogIconSize} bg={customIconBg} />
                      <div style={{ minWidth:0 }}>
                        <div style={{ font:`700 ${catalogFontSize} sans-serif`, color: customPillColor || '#0f172a' }}>{c.name}</div>
                        <div style={{ font:'400 12px sans-serif', color: customPillColor ? hexToRgba(customPillColor, 0.7) : '#94a3b8', marginTop:2 }}>{catServices.length} servi&ccedil;o{catServices.length === 1 ? '' : 's'}</div>
                      </div>
                    </button>
                  )
                })
              ) : !selDept?.id && categories.length === 0 ? (
                config.incCats.map(c => (
                  <button key={c.id} onClick={() => onSelectLegacyIncCat(c)}
                    style={{ display:'flex', alignItems:'center', gap:14, padding:18, background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:14, textAlign:'left', boxShadow:'0 1px 2px rgba(15,23,42,.04)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                    <div style={{ width:52, height:52, borderRadius:14, background:c.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0 }}>{c.emoji}</div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ font:'700 15px sans-serif', color:'#0f172a' }}>{c.name}</div>
                      <div style={{ font:'400 12px sans-serif', color:'#94a3b8', marginTop:2 }}>{c.symptoms.length} sintomas</div>
                    </div>
                  </button>
                ))
              ) : (
                <div style={{ gridColumn:'1 / -1', padding:20, color:'#94a3b8', font:'500 14px sans-serif', textAlign:'center' }}>
                  Nenhuma categoria de incidente cadastrada{selDept ? ` em ${selDept.name}` : ''}.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* INC: Servicos */}
      {screen === 'inc-services' && dbSelIncCat && (
        <div>
          <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>Qual servi&ccedil;o foi afetado?</h2>
          <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione o servi&ccedil;o para visualizar os sintomas dispon&iacute;veis.</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {(() => {
              const catServices = services.filter(service => service.category_id === dbSelIncCat.id)
              if (catServices.length === 0) {
                return <div style={{ gridColumn:'1 / -1', padding:20, color:'#94a3b8', font:'400 14px sans-serif', textAlign:'center' }}>Nenhum servi&ccedil;o cadastrado nesta categoria.</div>
              }
              return catServices.map(service => {
                const symptomCount = serviceSymptoms.filter(item => item.service_id === service.id).length
                return (
                  <button key={service.id} onClick={() => onSelectIncService(service)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'16px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:13, textAlign:'left', width:'100%', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0 }}>
                      <CatalogIcon icon={service.icon} name={service.name} size={36} />
                      <div style={{ minWidth:0 }}>
                        <div style={{ font:'700 14.5px sans-serif', color:'#0f172a' }}>{service.name}</div>
                        <div style={{ font:'400 12px sans-serif', color:'#94a3b8', marginTop:2 }}>{symptomCount} sintoma{symptomCount === 1 ? '' : 's'}</div>
                      </div>
                    </div>
                    <span style={{ fontSize:15, color:'#94a3b8', flexShrink:0 }}>&rarr;</span>
                  </button>
                )
              })
            })()}
          </div>
        </div>
      )}

      {/* INC: Sintomas */}
      {screen === 'inc-symptoms' && (dbSelIncService || selIncCat) && (
        <div>
          <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>O que está acontecendo?</h2>
          <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione o sintoma que melhor descreve o problema.</p>
          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            {dbSelIncService ? (
              (() => {
                const catSymptoms = serviceSymptoms.filter(ss => ss.service_id === dbSelIncService.id)
                if (catSymptoms.length === 0) {
                  return <div style={{ padding:20, color:'#94a3b8', font:'400 14px sans-serif', textAlign:'center' }}>Nenhum sintoma cadastrado neste servi&ccedil;o.</div>
                }
                return catSymptoms.map(ss => {
                  const svc = services.find(s => s.id === ss.service_id)
                  const label = ss.symptom?.name ? `${svc?.name || ''} — ${ss.symptom.name}` : (svc?.name || '')
                  const symptomLabel = ss.symptom?.name || label
                  return (
                    <button key={ss.id} onClick={() => onSelectIncSymptom(ss)}
                      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'15px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:13, textAlign:'left', width:'100%', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                        <CatalogIcon icon={ss.symptom?.icon} name={symptomLabel} size={28} />
                        <span style={{ font:'600 14.5px sans-serif', color:'#0f172a', marginLeft:8 }}>{symptomLabel}</span>
                      </div>
                      <span style={{ fontSize:15, color:'#94a3b8', flexShrink:0 }}>→</span>
                    </button>
                  )
                })
              })()
            ) : (
              selIncCat?.symptoms.map((s: string) => (
                <button key={s} onClick={() => onSelectLegacyIncSymptom(s)}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'15px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:13, textAlign:'left', width:'100%', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'#e2e8f0', flexShrink:0 }} />
                    <span style={{ font:'600 14.5px sans-serif', color:'#0f172a' }}>{s}</span>
                  </div>
                  <span style={{ fontSize:15, color:'#94a3b8', flexShrink:0 }}>→</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* REQ: Categorias */}
      {screen === 'req-cats' && (
        <div>
          <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>O que você quer solicitar?</h2>
          <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione a categoria da solicitação.</p>

          {catalogLoading ? (
            <div style={{ padding:20, color:'#94a3b8', font:'500 14px sans-serif', textAlign:'center' }}>Carregando categorias...</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {visibleReqCategories.length > 0 ? (
                visibleReqCategories.map(c => {
                  const catItems = reqItems.filter(it => {
                    if (it.request_category_id) return it.request_category_id === c.id
                    const sub = reqSubcategories.find(s => s.id === it.request_subcategory_id)
                    return sub ? sub.category_id === c.id : false
                  })
                  return (
                    <button key={c.id} onClick={() => onSelectReqCat(c)}
                      style={{
                        display:'flex',
                        alignItems:'center',
                        gap:14,
                        padding:18,
                        background: customPillBg || '#fff',
                        border: customPillBg ? `1.5px solid ${customPillBg}` : '1.5px solid #e2e8f0',
                        borderRadius:14,
                        textAlign:'left',
                        boxShadow:'0 1px 2px rgba(15,23,42,.04)',
                        cursor:'pointer',
                        transition:'transform .15s,box-shadow .15s'
                      }}>
                      <CatalogIcon icon={c.icon} name={c.name} size={catalogIconSize} bg={customIconBg} />
                      <div style={{ minWidth:0 }}>
                        <div style={{ font:`700 ${catalogFontSize} sans-serif`, color: customPillColor || '#0f172a' }}>{c.name}</div>
                        <div style={{ font:'400 12px sans-serif', color: customPillColor ? hexToRgba(customPillColor, 0.7) : '#94a3b8', marginTop:2 }}>{catItems.length} itens</div>
                      </div>
                    </button>
                  )
                })
              ) : !selDept?.id && reqCategories.length === 0 ? (
                config.reqCats.map(c => (
                  <button key={c.id} onClick={() => onSelectLegacyReqCat(c)}
                    style={{ display:'flex', alignItems:'center', gap:14, padding:18, background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:14, textAlign:'left', boxShadow:'0 1px 2px rgba(15,23,42,.04)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                    <div style={{ width:52, height:52, borderRadius:14, background:c.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0 }}>{c.emoji}</div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ font:'700 15px sans-serif', color:'#0f172a' }}>{c.name}</div>
                      <div style={{ font:'400 12px sans-serif', color:'#94a3b8', marginTop:2 }}>{c.items.length} itens</div>
                    </div>
                  </button>
                ))
              ) : (
                <div style={{ gridColumn:'1 / -1', padding:20, color:'#94a3b8', font:'500 14px sans-serif', textAlign:'center' }}>
                  Nenhuma categoria de requisição cadastrada{selDept ? ` em ${selDept.name}` : ''}.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* REQ: Subcategorias */}
      {screen === 'req-subcats' && dbSelReqCat && (
        <div>
          <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>{dbSelReqCat.name}</h2>
          <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione a subcategoria.</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {reqSubcategories.filter(s => s.category_id === dbSelReqCat.id && s.active).map(s => {
              const count = reqItems.filter(it => it.request_subcategory_id === s.id).length
              return (
                <button key={s.id} onClick={() => onSelectReqSubcat(s)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:18, background: customPillBg || '#fff', border: customPillBg ? `1.5px solid ${customPillBg}` : '1.5px solid #e2e8f0', borderRadius:14, textAlign:'left', boxShadow:'0 1px 2px rgba(15,23,42,.04)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                  <CatalogIcon icon={s.icon} name={s.name} size={catalogIconSize} bg={customIconBg} />
                  <div style={{ minWidth:0 }}>
                    <div style={{ font:`700 ${catalogFontSize} sans-serif`, color: customPillColor || '#0f172a' }}>{s.name}</div>
                    <div style={{ font:'400 12px sans-serif', color: customPillColor ? hexToRgba(customPillColor, 0.7) : '#94a3b8', marginTop:2 }}>{count} iten{count === 1 ? '' : 's'}</div>
                  </div>
                </button>
              )
            })}
            {reqItems.some(it => !it.request_subcategory_id && it.request_category_id === dbSelReqCat.id) && (
              <button onClick={onSelectLegacyReqSubcatOthers}
                style={{ display:'flex', alignItems:'center', gap:14, padding:18, background: customPillBg || '#fff', border: customPillBg ? `1.5px solid ${customPillBg}` : '1.5px solid #e2e8f0', borderRadius:14, textAlign:'left', boxShadow:'0 1px 2px rgba(15,23,42,.04)', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                <CatalogIcon icon="📂" name="Outros" size={catalogIconSize} bg={customIconBg} />
                <div style={{ minWidth:0 }}>
                  <div style={{ font:`700 ${catalogFontSize} sans-serif`, color: customPillColor || '#0f172a' }}>Outros</div>
                  <div style={{ font:'400 12px sans-serif', color: customPillColor ? hexToRgba(customPillColor, 0.7) : '#94a3b8', marginTop:2 }}>Demais solicitações</div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* REQ: Itens */}
      {screen === 'req-items' && (dbSelReqCat || selReqCat) && (
        <div>
          <h2 style={{ font:'700 20px sans-serif', color:'#0f172a', marginBottom:6 }}>{dbSelReqSubcat && dbSelReqSubcat.id !== OTHERS_SUBCAT_ID ? dbSelReqSubcat.name : dbSelReqCat ? dbSelReqCat.name : selReqCat?.name}</h2>
          <p style={{ font:'400 14px sans-serif', color:'#94a3b8', marginBottom:20 }}>Selecione o item desejado.</p>
          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            {dbSelReqCat ? (
              (() => {
                const catItems = dbSelReqSubcat && dbSelReqSubcat.id !== OTHERS_SUBCAT_ID
                  ? reqItems.filter(it => it.request_subcategory_id === dbSelReqSubcat.id)
                  : dbSelReqSubcat?.id === OTHERS_SUBCAT_ID
                    ? reqItems.filter(it => !it.request_subcategory_id && it.request_category_id === dbSelReqCat.id)
                    : reqItems.filter(it => {
                        if (it.request_category_id) return it.request_category_id === dbSelReqCat.id
                        const sub = reqSubcategories.find(s => s.id === it.request_subcategory_id)
                        return sub ? sub.category_id === dbSelReqCat.id : false
                      })

                if (catItems.length === 0) {
                  return <div style={{ padding:20, color:'#94a3b8', font:'400 14px sans-serif', textAlign:'center' }}>Nenhum item disponível nesta categoria.</div>
                }

                return catItems.map(item => (
                  <button key={item.id} onClick={() => onSelectReqItem(item)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'15px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:13, textAlign:'left', width:'100%', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                      <CatalogIcon icon={item.icon} name={item.name} size={28} />
                      <span style={{ font:'600 14.5px sans-serif', color:'#0f172a', marginLeft:8 }}>{item.name}</span>
                    </div>
                    <span style={{ fontSize:15, color:'#94a3b8', flexShrink:0 }}>→</span>
                  </button>
                ))
              })()
            ) : (
              selReqCat?.items.map((item: string) => (
                <button key={item} onClick={() => onSelectLegacyReqItem(item)}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'15px 18px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:13, textAlign:'left', width:'100%', cursor:'pointer', transition:'transform .15s,box-shadow .15s' }}>
                  <span style={{ font:'600 14.5px sans-serif', color:'#0f172a' }}>{item}</span>
                  <span style={{ fontSize:15, color:'#94a3b8', flexShrink:0 }}>→</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}
