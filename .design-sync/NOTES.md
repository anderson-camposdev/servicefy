# Servicefy Design System — Sync Notes

## Setup quirks

- **App não é uma library publicada**: `package.json` não tem `main`/`module`/`exports`. O conversor precisa de `--entry ./dist-lib/servicefy.js` explicitamente.
- **Componentes excluídos**: `IconPicker` (usa `serviceCatalogService` Supabase em runtime), `TicketTasksPanel` (usa `ticketTasksService`), `ErrorBoundary` (utilitário). Todos mapeados para `null` em `componentSrcMap`.
- **CSS compilado**: O build de CSS (`npx vite build`) falha quando `tsc -b` tem erros em outros arquivos (`CatalogManager.tsx`, etc.). Usar `npx vite build` diretamente (sem `npm run build`) para gerar o CSS. Copiar para `dist-lib/styles.css` após.
- **`.d.ts` não gerados**: O Vite lib build não gera `.d.ts`. O conversor usa ts-morph via `componentSrcMap` para descobrir props.
- **Fonte remota**: Hanken Grotesk e JetBrains Mono são carregadas via Google Fonts. `[FONT_REMOTE]` é esperado — não é erro.

## Known render warns

- `ImageFullcard` → URLs externas (icons8.com) não carregam no headless Chromium por bloqueio de rede. Card renderiza corretamente com fallback de texto. Comportamento esperado em ambiente de CI/headless.

## Buildcmd para re-sync

```bash
# 1. Rebuild library JS
npx vite build --config vite.lib.config.ts
# 2. Rebuild CSS compilada
npx vite build
# 3. Copiar CSS para caminho estável
cp dist/assets/index-*.css dist-lib/styles.css
```

## Re-sync risks

- **CSS hash muda a cada build**: O arquivo `dist/assets/index-*.css` muda de nome. O passo de cópia para `dist-lib/styles.css` é obrigatório em todo re-sync.
- **Novos componentes**: Adicionar entradas em `componentSrcMap` para qualquer novo componente em `src/components/`. Verificar se têm dependências Supabase antes de incluir.
- **TS errors em outros arquivos**: Os erros em `CatalogManager.tsx`, `ServiceCatalog.tsx` etc. são pré-existentes e não afetam o build da library. Não tente corrigir como parte do sync.
- **ServiceCard themes**: O preview de `ImageFullcard` usa URLs externas para ícones fluency (icons8.com). Em headless, cai para texto — comportamento correto documentado acima.
