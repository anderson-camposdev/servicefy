# ServiceFY ITSM — Arquitetura Multi-Tenant (White-Label / MSP)

Guia de onboarding de um novo cliente e visão geral da fundação multi-tenant.

## Visão geral

O ServiceFY é uma SPA (Vite + React) sobre Supabase, com isolamento por **tenant**
(`companies`). Há um tenant **provedor** (consultoria MSP) com superpoderes sobre
todos os clientes, e os demais tenants ficam estritamente isolados via RLS.

| Camada | Mecanismo | Arquivos |
|---|---|---|
| Identificação do tenant | Subdomínio `*.servicefy.app` → slug (com fallback `?tenant=` / localStorage) | [`src/tenant/resolveTenant.ts`](../src/tenant/resolveTenant.ts) |
| White-label | Branding (cores/logo/título) vindo de `companies`, aplicado via CSS vars | [`src/tenant/TenantContext.tsx`](../src/tenant/TenantContext.tsx), [`applyBranding.ts`](../src/tenant/applyBranding.ts) |
| Autenticação | Supabase Auth real; profile linkado por `auth_id` | [`src/auth/`](../src/auth/) |
| Isolamento | RLS por `company_id`; provedor via `is_provider_tenant`/`sysadmin` | migrations `010`, `011` |
| Provisionamento | RPC `provision_tenant` + wrapper TS | migration `012`, [`provisionTenant.ts`](../src/tenant/provisionTenant.ts) |

## Modelo de governança MSP

- **Provedor:** empresa com `companies.is_provider_tenant = true` **ou** usuário `sysadmin`.
  Lê/escreve dados de **todos** os clientes (fila unificada + seletor de cliente).
- **Cliente:** lê/escreve apenas registros com seu próprio `company_id`.

A regra é centralizada na função `public.is_current_user_msp_admin()` — todas as
policies a consultam, então mudar a governança não exige reescrever policies.

## Onboarding de um novo cliente

### 1. Provisionar o tenant
Autenticado como usuário do provedor MSP, chame o wrapper:

```ts
import { provisionTenant } from './tenant'

await provisionTenant({
  slug: 'acme',            // vira acme.servicefy.app
  name: 'Acme Corp',
  domain: 'acme.com',      // domínio de e-mail dos usuários
  primaryColor: '#7c3aed',
  accentColor: '#a78bfa',
  logoUrl: 'https://.../acme.png',
  welcomeTitle: 'Acme Service Desk',
  concurrentLicenses: 25,
  licensePlan: 'professional',
})
```

> A autorização é validada no banco (`provision_tenant` é `SECURITY DEFINER` e exige
> `is_current_user_msp_admin()`). É idempotente por `slug` (reexecutar atualiza o branding).

### 2. Apontar o subdomínio
Configure o DNS de `acme.servicefy.app` para o app. Ao acessar, o `resolveTenant`
extrai o slug `acme` e o `TenantContext` carrega o branding antes do login.

### 3. Criar o usuário administrador do cliente
No **Supabase Dashboard → Authentication → Users → Create new user**, informe o
e-mail do admin (ex.: `admin@acme.com`) e uma senha (marque *Auto Confirm*).
O trigger `handle_new_user`:
- linka a um profile existente de mesmo e-mail (se houver `auth_id` nulo); ou
- cria um profile `end_user` no tenant cujo `domain` casa com o e-mail.

Para conceder papel de admin do tenant, ajuste o profile:
```sql
UPDATE public.profiles SET role = 'company_admin'
WHERE email = 'admin@acme.com';
```

### 4. Pronto
A partir daí o RLS isola automaticamente os dados do novo cliente; nenhum código
precisa ser alterado para plugar o tenant.

## Desenvolvimento local

Sem subdomínio, fixe o tenant por query param ou storage:

```
http://localhost:5173/?tenant=acme
```
ou no console: `localStorage.setItem('flowfy.tenant', 'acme')`. A chave mantém
o prefixo anterior por compatibilidade com sessões já existentes.
