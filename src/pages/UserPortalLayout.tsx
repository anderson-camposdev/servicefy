import { useState } from 'react'
// Lucide React fornece ícones leves e modernos, perfeitos para ESM
import { Search, Monitor, BookOpen, AlertCircle, Clock, CheckCircle, ChevronRight } from 'lucide-react'
import { useTenant } from '../tenant'

/**
 * NOVO LAYOUT — Portal do Usuário (OmniSearch + Catálogo + Meus Chamados).
 *
 * Integrações já feitas nesta versão:
 *  • Cores white-label ligadas ao --brand-primary do tenant (useTenant()).
 *  • Logo e nome da empresa vindos do branding real.
 *
 * MOCKS restantes (catálogo, chamados, busca) seguem a modelagem das
 * tabelas e serão trocados pelas chamadas reais do Supabase futuramente.
 */
const mockCompanyBranding = {
  logo_url: 'https://images.unsplash.com/photo-1614741118887-7a4ee193a5fa?q=80&w=300&auto=format&fit=crop',
  welcome_message: 'Como podemos te ajudar hoje, Anderson?',
}

// Segue a hierarquia: Departamento -> Categoria (Tabela: catalog_categories)
const mockCatalogCategories = [
  { id: 1, name: 'Tecnologia (TI)', icon: Monitor, description: 'Problemas técnicos, acessos, equipamentos' },
  { id: 2, name: 'Recursos Humanos (RH)', icon: CheckCircle, description: 'Dúvidas sobre férias, benefícios, folha' },
  { id: 3, name: 'Compras', icon: Clock, description: 'Solicitar material, notebooks, softwares' },
  { id: 4, name: 'Base de Conhecimento', icon: BookOpen, description: 'Tutoriais e FAQs (Melhoria Contínua)' },
]

// Segue os tickets abertos do usuário (Tabela: tickets + joins)
const mockUserTickets = [
  { id: 'INC-08722', title: 'Sistema ERP Lento', statusLabel: 'Em Atendimento', statusColor: 'bg-red-100 text-red-700', updated: 'há 10 min' },
  { id: 'REQ-09101', title: 'Novo Monitor 24"', statusLabel: 'Aguardando Aprovação', statusColor: 'bg-amber-100 text-amber-800', updated: 'há 2 horas' },
  { id: 'INC-08550', title: 'Falha na VPN (Recorrência)', statusLabel: 'Resolvido', statusColor: 'bg-green-100 text-green-700', updated: 'há 1 dia' },
]

// O "OmniSearch": Simulação de resultados cruzados para a Busca Inteligente
const mockSearchResults = [
  { type: 'Service Item', title: 'Reset de Senha ERP', category: 'TI > Acessos' },
  { type: 'KB Article', title: 'Como configurar VPN corporativa', category: 'Tutoriais' },
  { type: 'Service Item', title: 'Solicitar Novo Crachá', category: 'RH > Facilities' },
]

const UserPortalLayout = () => {
  const { branding, tenant } = useTenant()
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)

  // White-label real: cores seguem o --brand-primary do tenant; logo/nome do branding.
  const logoUrl = branding.logoUrl || mockCompanyBranding.logo_url
  const companyName = tenant?.name || branding.name

  return (
    // --primary-color encadeia o token global do tenant (definido por applyBranding).
    <div
      style={{ '--primary-color': 'var(--brand-primary)' } as React.CSSProperties}
      className="min-h-screen bg-slate-50 text-slate-900 antialiased"
    >

      {/* 1. HEADER (Design System Enterprise) */}
      <header className="sticky top-0 z-40 w-full border-b bg-white/95 backdrop-blur">
        <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <img src={logoUrl} alt="Company Logo" className="h-8 w-auto rounded" />
            <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-600">
              <a href="#" className="font-semibold" style={{ color: 'var(--primary-color)' }}>Início</a>
              <a href="#" className="hover:text-slate-950">Meus Chamados</a>
              <a href="#" className="hover:text-slate-950">Biblioteca</a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-right">
              <p className="font-semibold">Anderson Silva</p>
              <p className="text-slate-500">{companyName}</p>
            </div>
            <img src="https://api.dicebear.com/8.x/notionists/svg?seed=anderson" alt="Avatar" className="h-10 w-10 rounded-full border border-slate-200" />
          </div>
        </div>
      </header>

      {/* 2. AREA DE BUSCA INTELIGENTE (OmniSearch) */}
      <div className="border-b bg-white">
        <div className="container mx-auto max-w-4xl py-12 px-4 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 mb-8">{mockCompanyBranding.welcome_message}</h1>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowSearchResults(e.target.value.length > 2) // Ativa quando o usuário digita
              }}
              placeholder="🔍 Tente 'resetar senha' ou 'solicitar notebook'..."
              className="w-full h-14 pl-12 pr-6 rounded-2xl border border-slate-200 bg-slate-50 text-lg shadow-sm outline-none transition-all focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-[var(--brand-primary)]"
            />

            {/* DROP-DOWN DE RESULTADOS DA BUSCA INTELIGENTE (Usa OmniSearch) */}
            {showSearchResults && (
              <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-white border border-slate-200 rounded-xl shadow-lg z-50 text-left">
                {mockSearchResults.map((result, index) => (
                  <button key={index} className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 group">
                    <div className="flex items-center gap-3">
                      {result.type === 'KB Article'
                        ? <BookOpen className="h-5 w-5 text-sky-600" />
                        : <AlertCircle className="h-5 w-5" style={{ color: 'var(--primary-color)' }} />}
                      <div>
                        <p className="font-semibold text-sm">{result.title}</p>
                        <p className="text-xs text-slate-500">{result.category} • {result.type}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-950" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. CONTEÚDO PRINCIPAL (LAYOUT DIVIDIDO) */}
      <main className="container mx-auto max-w-7xl py-10 px-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

          {/* LADO ESQUERDO: CATÁLOGO DE SERVIÇOS (60%) */}
          <section className="lg:col-span-8">
            <h2 className="text-2xl font-bold mb-6 text-slate-950">Nossos Serviços</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {mockCatalogCategories.map((cat) => {
                const Icon = cat.icon
                return (
                  <button key={cat.id} className="flex gap-5 p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all text-left">
                    <div
                      className="flex-shrink-0 h-14 w-14 rounded-xl flex items-center justify-center border bg-slate-50"
                      style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 20%, transparent)', color: 'var(--primary-color)' }}
                    >
                      <Icon className="h-8 w-8" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950">{cat.name}</h3>
                      <p className="text-sm text-slate-600 mt-1">{cat.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* LADO DIREITO: RESUMO DO USUÁRIO (40%) */}
          <section className="lg:col-span-4 space-y-6">
            <h2 className="text-2xl font-bold text-slate-950">Meus Chamados Abertos</h2>

            {/* Widget de Chamados (Dashboard orientada a dados) */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
              {mockUserTickets.map((ticket) => (
                <a key={ticket.id} href="#" className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 group">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-slate-950 truncate group-hover:text-[var(--primary-color)]">{ticket.title}</p>
                    <p className="text-xs text-slate-500">{ticket.id} • atualizado {ticket.updated}</p>
                  </div>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${ticket.statusColor}`}>
                    {ticket.statusLabel}
                  </span>
                </a>
              ))}
            </div>

            {/* Atalho rápido para reabrir (Prevenção de Duplicidade) */}
            <div className="p-5 bg-orange-50 border border-orange-200 rounded-2xl flex gap-3 text-orange-950">
              <AlertCircle className="h-6 w-6 text-orange-700 flex-shrink-0" />
              <p className="text-sm">Seu problema é recorrente ou não foi bem resolvido? <a href="#" className="font-bold underline hover:text-orange-700">Reabra seu último ticket Resolvido</a> em vez de abrir um novo.</p>
            </div>
          </section>

        </div>
      </main>
    </div>
  )
}

export default UserPortalLayout
