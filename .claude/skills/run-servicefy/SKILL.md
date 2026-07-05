---
name: run-servicefy
description: Build, run, start, screenshot, and drive the ServiceFY ITSM web app. Use when asked to start ServiceFY, run its dev server, take a screenshot of any screen, test the portal, build the app, or interact with the running UI.
---

ServiceFY ITSM is a multi-tenant ITSM SaaS built with Vite + React 19 + TypeScript + Tailwind v4. Drive it via **`.claude/skills/run-servicefy/driver.mjs`** against a running dev server — it uses Playwright's Node API directly (no `chromium-cli`).

Screenshots land in `.claude/skills/run-servicefy/shots/`.

All paths are relative to the repo root (`c:\Users\Anderson Campos\servicefy\`).

## Prerequisites

Node 18+ and npm must be available. Playwright Chromium (already installed):

```bash
npx playwright install chromium
```

Chromium resolves to `%LOCALAPPDATA%\ms-playwright\chromium-1228\chrome-win64\chrome.exe`.

No additional `apt-get` needed — this project runs on Windows.

## Setup

```bash
npm install
```

Env vars are in `.env.local` (already present — Supabase URL and anon key). The driver mocks all Supabase calls so you never need real credentials to screenshot or smoke-test.

## Build

```bash
npx vite build   # production bundle → dist/
```

TypeScript check only:
```bash
npx tsc --noEmit --skipLibCheck
```

## Run (agent path)

### 1. Start the dev server

```bash
npx vite --port 5173 > /tmp/vite.log 2>&1 &
echo $! > /tmp/vite.pid
timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
```

Stop it when done:
```bash
kill $(cat /tmp/vite.pid) 2>/dev/null || pkill -f "vite --port 5173"
```

### 2. Drive with the driver

```bash
node .claude/skills/run-servicefy/driver.mjs <command> [args]
```

| Command | What it does |
|---|---|
| `smoke` | Portal loads, no page errors — exits 0 or 1 |
| `screenshot [outfile]` | Portal home screen → `shots/portal-home.png` |
| `screenshot-admin [outfile]` | Admin dashboard (AnalystCockpit) → `shots/admin-home.png` |
| `navigate <path> [outfile]` | Any route, e.g. `navigate /portal shots/my.png` |
| `flow-incident [outfile]` | Full 3-step incident flow → 4 screenshots (cats, symptoms, form, done) |

All screenshots default to `shots/<name>.png` inside the skill dir.

### Quick one-liner (screenshot portal)

```bash
npx vite --port 5173 > /tmp/vite.log 2>&1 &
timeout 20 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
node .claude/skills/run-servicefy/driver.mjs screenshot
kill %1
```

### Auth in the driver

The driver mocks all Supabase endpoints (REST, auth, realtime) and injects a fake JWT into `localStorage`. No real Supabase credentials are needed. The mock user is:

- name: `Analista Teste`
- email: `analista@acme.com`
- role: `agent`
- tenant: `Acme Corp` (`company-a-uuid`)

## Run (human path)

```bash
npm run dev   # → http://localhost:5173, hot-reload. Ctrl-C to stop.
```

Real Supabase credentials required for data (already in `.env.local`). Auth via the login page.

## Test

```bash
# Auth + multitenancy specs (5 tests, ~15s) — all pass
npx playwright test tests/e2e/auth.spec.ts

# Full e2e suite
npx playwright test
```

The dev server starts automatically via `webServer` in `playwright.config.ts`.

## Gotchas

- **`smoke.spec.ts` is stale**: it expects `Olá.*Analista` and `Reportar um Problema` (old portal text). The portal was rewritten — heading is now `"Como posso te ajudar, Analista?"` and the card says `"Reportar Problema"`. The Playwright spec fails; the driver works with the new design.

- **Top-bar overlay in screenshots**: the portal renders inside `WorkspaceLayout` which adds a `"SIMULAR PAPEL"` / `"← Painel do Agente"` header. This is correct behaviour for the `agent` role — real end-users see it differently. If you need a pure portal screenshot, navigate directly to the portal sub-route.

- **React controlled inputs**: `fill` (Playwright) works; raw DOM `.value =` does not fire `onChange`. The driver uses `page.locator('textarea').first().fill(...)`.

- **`wait-idle` never settles** due to Supabase realtime WebSocket retry loop. The driver uses `waitForTimeout` after navigation, not `waitUntil:'networkidle'` for flow steps.

- **Incident mock returns `INC-09999`**: the driver's mock always returns this number. Real submissions go to Supabase and get a DB-generated number (e.g. `INC-00042`).

- **Port conflict**: if you get `EADDRINUSE: address already in use :::5173`, kill the old server first: `pkill -f "vite --port 5173"`.

## Troubleshooting

- **`Cannot find module '@playwright/test'`**: run `npm install` first.
- **Driver hangs at `goto`**: dev server not running — start it first, poll port 5173.
- **Screenshot is blank / white**: React hydration took > 15s — increase `waitForTimeout` in the driver or add a `waitForSelector` call.
- **`smoke` exits 1 "Portal content not found"**: check `/tmp/vite.log` for build errors; run `npx tsc --noEmit --skipLibCheck` to surface TypeScript issues.
