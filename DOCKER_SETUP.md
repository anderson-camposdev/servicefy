# ServiceFY Docker Setup

Guia rápido para iniciar seu projeto com Docker.

## 🚀 Quick Start

### Opção 1: Supabase Remoto (Recomendado)

Mais simples — usa suas credenciais do Supabase Cloud.

```bash
# 1. Configure o .env com suas credenciais
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon

# 2. Inicie
docker compose up -d --pull always

# 3. Acesse
# App: http://localhost:5173
# Email (Mailpit): http://localhost:8025
```

### Opção 2: Supabase Local

Stack completo em containers — PostgreSQL, Auth, REST API, Realtime, tudo local.

```bash
# 1. Inicie todos os serviços
docker compose -f docker-compose.supabase.yml up -d --pull always

# 2. Aguarde ~30s para inicializar

# 3. Configure .env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9

# 4. Acesse
# App: http://localhost:5173
# Email: http://localhost:8025
# REST API: http://localhost:3000
# Auth: http://localhost:9999
# Realtime: http://localhost:4000
```

## 📋 Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| `Dockerfile` | Multi-stage build React + TypeScript |
| `docker-compose.yml` | Produção — frontend + Mailpit |
| `docker-compose.supabase.yml` | Dev completo — frontend + Supabase local |
| `.env` | Variáveis de ambiente (gitignore) |
| `.env.example` | Template com explicações |
| `.dockerignore` | Otimiza build excludindo arquivos desnecessários |
| `setup.sh` / `setup.bat` | Scripts interativos de setup |

## 🔧 Configuração Passo a Passo

### Passo 1: Escolha seu setup

**Se usa Supabase Cloud (recomendado):**
```bash
# Copie suas credenciais de https://supabase.com/dashboard
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Se quer Supabase local:**
```bash
# Deixe os valores padrão do docker-compose.supabase.yml
VITE_SUPABASE_URL=http://kong:8000
```

### Passo 2: Edite .env

```bash
vim .env  # ou seu editor favorito
```

### Passo 3: Inicie os containers

**Opção 1 (Supabase Remoto):**
```bash
docker compose up -d --pull always
```

**Opção 2 (Supabase Local):**
```bash
docker compose -f docker-compose.supabase.yml up -d --pull always
```

### Passo 4: Verifique

```bash
# Lista containers
docker ps

# Vê logs da app
docker compose logs -f frontend

# Testa a app
curl http://localhost:5173

# Para tudo
docker compose down
```

## 🔗 URLs Importantes

| Serviço | URL Local | URL Remoto |
|---------|-----------|-----------|
| **Frontend** | http://localhost:5173 | — |
| **Email (Mailpit)** | http://localhost:8025 | — |
| **Supabase API** | http://localhost:3000 | https://seu-projeto.supabase.co |
| **Supabase Auth** | http://localhost:9999 | — |
| **Realtime** | http://localhost:4000 | wss://seu-projeto.supabase.co |

## 🛑 Troubleshooting

### "Cannot connect to Docker daemon"
```bash
# Windows: reinicie Docker Desktop
# Linux: sudo systemctl start docker
```

### Supabase local não inicia
```bash
# Verifique os logs
docker compose -f docker-compose.supabase.yml logs postgres
docker compose -f docker-compose.supabase.yml logs auth

# Limpe e tente novamente
docker system prune -a --volumes
docker compose -f docker-compose.supabase.yml up -d --pull always
```

### App não vê credenciais Supabase
- Certifique-se que `.env` está na raiz do projeto
- Variáveis devem começar com `VITE_` para serem expostas ao frontend
- Rode `docker compose up` novamente

### Mailpit mostra "Unable to connect"
- Espere alguns segundos para iniciar
- Acesse http://localhost:8025

## 📦 Tamanho das Imagens

```bash
docker images | grep servicefy
# servicefy-frontend:latest    ~200MB (multi-stage otimizado)

docker images | grep -E "postgres|kong|gotrue"
# postgres:16-alpine          ~100MB
# kong:3.4-alpine             ~150MB
# supabase/gotrue             ~120MB
```

## 🔐 Segurança (Importante!)

⚠️ **Nunca commite `.env` com credenciais reais!**

```bash
# Gitignore já inclui:
.env
.env.local

# Use .env.example para compartilhar template
git add .env.example
git commit -m "docs: env template"
```

**Para Supabase Local:**
- Mude os JWT_SECRET em `docker-compose.supabase.yml`
- Use senhas fortes para `POSTGRES_PASSWORD`
- Remova os valores `[REDACTED]` com senhas reais

## 📚 Próximos Passos

- [ ] Confira migrations em `supabase/migrations/`
- [ ] Configure seed data em `supabase/seed_*.sql`
- [ ] Deploy: `docker push seu-registry/servicefy:latest`
- [ ] CI/CD: GitHub Actions / GitLab CI para builds automáticos
- [ ] Monitoramento: Adicione Prometheus + Grafana se necessário
- [ ] Healthchecks: Já configurados, mas customize se precisar

## 💬 Comandos Úteis

```bash
# Ver logs em tempo real
docker compose logs -f

# Reiniciar um serviço
docker compose restart frontend

# Entrar no container
docker compose exec frontend sh

# Parar tudo sem deletar volumes
docker compose stop

# Deletar tudo (inclui dados)
docker compose down -v

# Rebuild a imagem
docker compose build --no-cache frontend

# Atualizar imagens base
docker compose pull
docker compose up -d --pull always
```

---

**Dúvidas?** Veja `setup.sh` para um guia interativo, ou rode `docker compose config` para validar.
