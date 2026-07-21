#!/usr/bin/env bash
# ============================================================
# ServiceFY — Sincroniza o banco local (Docker) com o projeto
# Supabase vinculado na nuvem (schema + dados).
#
# Uso:
#   npm run db:sync-from-cloud            # pede confirmação
#   npm run db:sync-from-cloud -- --yes    # pula a confirmação
#
# O QUE FAZ:
#   1. Faz backup do schema `public` local atual (por segurança).
#   2. Baixa da nuvem (via `supabase db dump --linked`):
#        - schema completo (tabelas, funções, policies, triggers)
#        - dados de public, auth e storage
#   3. Recria o schema `public` local do zero e carrega o schema
#      baixado.
#   4. Limpa auth.users/identities e storage.objects/buckets
#      locais e carrega os dados baixados no lugar.
#   5. Reinicia PostgREST/Realtime locais para pegar o schema novo.
#
# O QUE NÃO FAZ:
#   - Nunca escreve na nuvem — só lê (`supabase db dump`).
#   - Não mexe nos schemas internos do Supabase (auth/storage/
#     realtime) além de repovoar as TABELAS deles com os dados
#     baixados — a estrutura interna continua gerida pela própria
#     stack local do Supabase CLI.
#
# AVISO: isso APAGA todo o conteúdo atual do schema `public` local
# (tabelas, dados, tudo) e todos os usuários/identidades locais de
# auth.users antes de recarregar. Um backup do `public` local atual
# fica salvo em .db-backups/ (gitignored) antes de qualquer coisa
# ser apagada — para restaurar: `docker exec supabase_db_servicefy
# pg_restore -U postgres -d postgres --clean --if-exists <arquivo>`.
# ============================================================
set -euo pipefail

CONTAINER="supabase_db_servicefy"
REST_CONTAINER="supabase_rest_servicefy"
REALTIME_CONTAINER="supabase_realtime_servicefy"
TMP_DIR=".tmp_clone"
BACKUP_DIR=".db-backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
export MSYS_NO_PATHCONV=1

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

if [[ "${1:-}" != "--yes" && "${1:-}" != "-y" ]]; then
  echo "Isso vai APAGAR o schema 'public' local e recarregar com uma cópia da nuvem."
  echo "Também apaga auth.users/identities e storage.objects/buckets locais."
  read -r -p "Digite SIM para continuar: " confirm
  [[ "$confirm" == "SIM" ]] || die "Cancelado."
fi

command -v docker >/dev/null || die "Docker não encontrado no PATH."
docker inspect "$CONTAINER" >/dev/null 2>&1 || die "Container $CONTAINER não está rodando (rode 'supabase start' primeiro)."

mkdir -p "$TMP_DIR" "$BACKUP_DIR"

log "1/7 — Backup do schema public local atual (segurança)"
BACKUP_FILE="$BACKUP_DIR/local_public_${TIMESTAMP}.dump"
docker exec "$CONTAINER" pg_dump -U postgres -d postgres --schema=public -Fc -f /tmp/local_public_backup.dump
docker cp "$CONTAINER:/tmp/local_public_backup.dump" "$BACKUP_FILE"
docker exec "$CONTAINER" rm -f /tmp/local_public_backup.dump
echo "Backup salvo em $BACKUP_FILE"

log "2/7 — Baixando schema da nuvem (supabase db dump --linked)"
npx supabase db dump --linked -f "$TMP_DIR/remote_schema.sql"

log "3/7 — Baixando dados da nuvem (public, auth, storage)"
npx supabase db dump --linked --data-only --schema public,auth,storage -f "$TMP_DIR/remote_data.sql"

log "4/7 — Recriando o schema public local"
docker exec "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON SCHEMA public TO postgres;
"

log "5/7 — Carregando schema baixado"
docker cp "$TMP_DIR/remote_schema.sql" "$CONTAINER:/tmp/remote_schema.sql"
docker exec "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/remote_schema.sql

log "6/7 — Limpando auth/storage locais e carregando dados baixados"
docker exec "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
TRUNCATE auth.identities CASCADE;
TRUNCATE auth.users CASCADE;
TRUNCATE storage.objects CASCADE;
TRUNCATE storage.buckets CASCADE;
"
docker cp "$TMP_DIR/remote_data.sql" "$CONTAINER:/tmp/remote_data.sql"
docker exec "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/remote_data.sql

log "7/7 — Reiniciando PostgREST/Realtime locais"
docker restart "$REST_CONTAINER" "$REALTIME_CONTAINER" >/dev/null

docker exec "$CONTAINER" rm -f /tmp/remote_schema.sql /tmp/remote_data.sql
rm -rf "$TMP_DIR"

log "Concluído — banco local sincronizado com a nuvem. Backup do estado anterior: $BACKUP_FILE"
