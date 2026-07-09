
interface PortalSearchHeaderProps {
  searchQ: string
  setSearchQ: (q: string) => void
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
  searchResults: any[]
  onSelectResult: (result: any) => void
}

export function PortalSearchHeader({
  searchQ,
  setSearchQ,
  searchOpen,
  setSearchOpen,
  searchResults,
  onSelectResult,
}: PortalSearchHeaderProps) {
  return (
    <div style={{ flexShrink:0, padding:'14px 28px', background:'#fff', borderBottom:'1px solid #e2e8f0', position:'relative', zIndex:40 }}>
      <div style={{ position:'relative' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"
          style={{ position:'absolute', left:15, top:'50%', transform:'translateY(-50%)', width:17, height:17, pointerEvents:'none' }}>
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input type="text" value={searchQ}
          onChange={e => { setSearchQ(e.target.value); setSearchOpen(true) }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
          placeholder="Busque um problema ou serviço… (ex: VPN, senha, notebook)"
          style={{ width:'100%', height:48, padding:'0 18px 0 46px', border:'2px solid #e2e8f0', borderRadius:13, background:'#f8fafc', font:'400 15px sans-serif', outline:'none', boxSizing:'border-box' }} />
        {searchOpen && searchResults.length > 0 && (
          <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0, background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, boxShadow:'0 8px 32px rgba(15,23,42,.12)', overflow:'hidden', zIndex:50 }}>
            {searchResults.map((r, i) => (
              <button key={i} onMouseDown={() => onSelectResult(r)}
                style={{ display:'flex', alignItems:'center', gap:12, width:'100%', padding:'11px 16px', background:'none', textAlign:'left', borderBottom:'1px solid #f1f5f9', cursor:'pointer' }}>
                <span style={{ fontSize:17, flexShrink:0 }}>{r.type==='incident'?'⚠️':'✅'}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ font:'600 14px sans-serif', color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.label}</div>
                  <div style={{ font:'400 12px sans-serif', color:'#94a3b8' }}>{r.sub}</div>
                </div>
                <span style={{ font:'600 11px monospace', padding:'2px 8px', borderRadius:5, flexShrink:0, background:r.tagBg, color:r.tagFg }}>{r.tag}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
