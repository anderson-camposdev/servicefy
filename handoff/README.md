# Handoff: Servicefy Portal do Usuário
> **Para o Claude Code:** implemente as tarefas abaixo em ordem. Toque **somente** nos arquivos listados em cada tarefa.
>
> ⚠️ **NÃO ALTERE** nenhum destes arquivos: `AnalystCockpit.tsx`, `TicketManagementDashboard.tsx`, `WorkspaceLayout.tsx`, `ServiceFYBI.tsx`, `AdminDashboard.tsx`, `CatalogManager.tsx` e qualquer outro arquivo não listado abaixo.

---

## ESCOPO DAS MUDANÇAS

| Arquivo | Ação |
|---------|------|
| `src/index.css` | Substituir :root + @theme pelos tokens corrigidos |
| `src/pages/UserPortalLayout.tsx` | Redesign completo do portal do usuário |
| `src/tenant/applyBranding.ts` | +1 linha (fix white-label) |
| `src/theme/ThemeProvider.tsx` | +1 linha (fix white-label) |

**Tudo o mais: sem alterações.**

---

## TAREFA 1 — src/index.css

**Ação:** Substitua **todo o conteúdo** de `src/index.css` pelo conteúdo do arquivo `servicefy-tokens.css` incluso neste pacote.

Correções aplicadas:
- F1: `font-sans` → Hanken Grotesk (remove referência a "Inter")
- F2: `--color-primary` passa a ler `--brand-primary` (token que o motor grava)
- F3: Escala tipográfica nomeada disponível como utilities
- F4: Tokens semânticos de prioridade/status/SLA centralizados

---

## TAREFA 2 — src/tenant/applyBranding.ts

**Ação:** Adicione **1 linha** após o `setProperty` de `--brand-bg`:

```ts
// ANTES:
root.style.setProperty('--brand-bg', branding.backgroundColor)

// DEPOIS:
root.style.setProperty('--brand-bg', branding.backgroundColor)
root.style.setProperty('--color-bg-primary', branding.backgroundColor)  // ← ADD
```

---

## TAREFA 3 — src/theme/ThemeProvider.tsx

**Ação:** Adicione **1 linha** dentro do `useEffect`, após o `setProperty` de `--brand-bg`:

```ts
// ANTES:
root.style.setProperty('--brand-bg', bg)

// DEPOIS:
root.style.setProperty('--brand-bg', bg)
root.style.setProperty('--color-bg-primary', bg)  // ← ADD
```

---

## TAREFA 4 — src/pages/UserPortalLayout.tsx

**Ação:** Substitua **todo o conteúdo** do arquivo pela implementação abaixo.

### Estrutura do novo portal

```
Layout: sidebar (268px fixo) + área principal (flex: 1)

SIDEBAR:
  - Logo do tenant (upload via file input, persiste em localStorage)
  - Nome da empresa + título do portal (centralizados)
  - Navegação: Início, Meus Chamados, Base de Conhecimento, Histórico
  - Lista de chamados ativos (3 mais recentes com indicador de status)
  - Mini-stats: Críticos P1 + % SLA OK
  - Avatar do usuário

ÁREA PRINCIPAL:
  - Top bar: saudação (bom dia/tarde/noite) + título contextual
  - [HOME] Barra de busca preditiva com dropdown de resultados
  - [HOME] Cards de ação: "Reportar Problema" e "Solicitar Serviço"
  - [HOME] Categorias secundárias: RH, Compras, Base de Conhecimento
  - [FLOW] Fluxo de abertura: categorias → sintomas/itens → formulário
  - [DONE] Tela de confirmação com número do chamado
```

### Fluxo de telas (state machine)

```ts
type Screen =
  | 'home'           // catálogo principal
  | 'inc-cats'       // seleção de categoria de incidente
  | 'inc-symptoms'   // seleção de sintoma
  | 'inc-form'       // formulário (impacto + urgência + descrição)
  | 'req-cats'       // seleção de categoria de requisição
  | 'req-items'      // seleção de item
  | 'req-form'       // formulário (justificativa)
  | 'done'           // confirmação com número do chamado
```

### Cálculo automático de prioridade

```ts
const PRIORITY_MATRIX: Record<string, string> = {
  'High-High': 'P1 — Crítica',
  'High-Media': 'P2 — Alta',   'Media-High': 'P2 — Alta',
  'High-Low':  'P3 — Moderada','Low-High':   'P3 — Moderada','Media-Media':'P3 — Moderada',
  'Media-Low': 'P4 — Baixa',   'Low-Media':  'P4 — Baixa',   'Low-Low':    'P4 — Baixa',
}
```

### White-label: como ler a cor de marca

```tsx
// Usar CSS variable do token (nunca hardcode):
const primaryColor = 'var(--color-primary)'  // lê --brand-primary após TAREFA 1
const primaryBg    = 'var(--color-bg-primary)'
```

### Busca preditiva

A busca cruza sintomas de incidentes + itens de requisição em memória:
```ts
// Montar índice na inicialização:
const searchIndex = [
  ...incidentCategories.flatMap(cat =>
    cat.symptoms.map(s => ({ type: 'incident', label: s.name, category: cat.name, catId: cat.id, symptomId: s.id }))),
  ...requestCategories.flatMap(cat =>
    cat.items.map(i => ({ type: 'request', label: i.name, category: cat.name, catId: cat.id, itemId: i.id }))),
]
// Filtrar com query.toLowerCase().trim() ≥ 2 chars, slice(0, 8)
```

### Upload de logo do tenant

```tsx
// Persistir em localStorage com chave por tenant:
const LOGO_KEY = `servicefy-portal-logo-${companyId}`

// Ler no mount:
const saved = localStorage.getItem(LOGO_KEY)
if (saved) setLogoDataUrl(saved)

// Salvar no change do input:
const reader = new FileReader()
reader.onload = (e) => {
  const dataUrl = e.target?.result as string
  localStorage.setItem(LOGO_KEY, dataUrl)
  setLogoDataUrl(dataUrl)
}
reader.readAsDataURL(file)
```

### Cores dos tokens semânticos de prioridade

```ts
// Usar os tokens do servicefy-tokens.css, não hardcode:
const PRIORITY_STYLES = {
  1: { badge: 'bg-p1-bg text-p1-fg border-p1/20', dot: 'bg-p1', label: 'P1 · Crítica' },
  2: { badge: 'bg-p2-bg text-p2-fg border-p2/20', dot: 'bg-p2', label: 'P2 · Alta'    },
  3: { badge: 'bg-p3-bg text-p3-fg border-p3/20', dot: 'bg-p3', label: 'P3 · Moderada'},
  4: { badge: 'bg-p4-bg text-p4-fg border-p4/20', dot: 'bg-p4', label: 'P4 · Baixa'   },
  5: { badge: 'bg-p5-bg text-p5-fg border-p5/20', dot: 'bg-p5', label: 'P5 · Planej.' },
}
```

### Paleta de status (também nos tokens)

```ts
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  'New':         { bg: 'bg-new-bg',      text: 'text-new-fg',      label: 'Novo'          },
  'In Progress': { bg: 'bg-progress-bg', text: 'text-progress-fg', label: 'Em Atendimento'},
  'On Hold':     { bg: 'bg-hold-bg',     text: 'text-hold-fg',     label: 'Pendente'      },
  'Resolved':    { bg: 'bg-resolved-bg', text: 'text-resolved-fg', label: 'Resolvido'     },
  'Closed':      { bg: 'bg-closed-bg',   text: 'text-closed-fg',   label: 'Fechado'       },
}
```

---

## Paleta de prioridade (referência visual)

| Nível | Sólido | BG pill | Texto |
|-------|--------|---------|-------|
| P1 Crítica   | `#DC2626` | `#FEE2E2` | `#991B1B` |
| P2 Alta      | `#EA580C` | `#FFEDD5` | `#C2410C` |
| P3 Moderada  | `#EAB308` | `#FEF9C3` | `#713F12` |
| P4 Baixa     | `#2563EB` | `#DBEAFE` | `#1D4ED8` |
| P5 Planejada | `#16A34A` | `#DCFCE7` | `#166534` |

---

## Arquivos de referência neste pacote

- `servicefy-tokens.css` — substitui src/index.css
- `Servicefy Portal Station.dc.html` — protótipo navegável completo (referência visual + comportamento)
- `Servicefy Analise Visual.dc.html` — auditoria com justificativas de cada decisão
