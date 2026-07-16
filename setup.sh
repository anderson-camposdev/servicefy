#!/bin/bash

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}ServiceFY Docker Setup${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo "Escolha sua configuração:"
echo ""
echo "  1) Supabase REMOTO (Recomendado - use suas credenciais do dashboard)"
echo "  2) Supabase LOCAL (Desenvolvimento local - todos os serviços em containers)"
echo ""
read -p "Digite 1 ou 2: " choice

case $choice in
  1)
    echo -e "${GREEN}✓ Configurado para Supabase REMOTO${NC}"
    echo ""
    echo "Próximos passos:"
    echo "  1. Edite .env e adicione suas credenciais:"
    echo "     - VITE_SUPABASE_URL"
    echo "     - VITE_SUPABASE_ANON_KEY"
    echo ""
    echo "  2. Inicie os containers:"
    echo "     ${BLUE}docker compose up -d --pull always${NC}"
    echo ""
    echo "  3. Acesse: http://localhost:5173"
    echo "  4. Email (Mailpit): http://localhost:8025"
    ;;

  2)
    echo -e "${GREEN}✓ Configurado para Supabase LOCAL${NC}"
    echo ""
    echo "Próximos passos:"
    echo "  1. Inicie todos os serviços:"
    echo "     ${BLUE}docker compose -f docker-compose.supabase.yml up -d --pull always${NC}"
    echo ""
    echo "  2. Aguarde ~30s para os serviços iniciarem"
    echo ""
    echo "  3. Configure as URLs no .env:"
    echo "     VITE_SUPABASE_URL=http://localhost:54321"
    echo "     VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    echo ""
    echo "  4. Acesse:"
    echo "     - App: http://localhost:5173"
    echo "     - Email (Mailpit): http://localhost:8025"
    echo "     - REST API: http://localhost:3000"
    echo "     - Auth Admin: http://localhost:9999"
    echo ""
    echo -e "${RED}⚠ Nota: Atualize os JWT_SECRET e senhas em docker-compose.supabase.yml!${NC}"
    ;;

  *)
    echo -e "${RED}Opção inválida${NC}"
    exit 1
    ;;
esac
