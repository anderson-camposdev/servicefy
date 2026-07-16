@echo off
setlocal enabledelayedexpansion

echo.
echo ================================
echo ServiceFY Docker Setup
echo ================================
echo.
echo Escolha sua configuracao:
echo.
echo   1) Supabase REMOTO (Recomendado - use suas credenciais do dashboard)
echo   2) Supabase LOCAL (Desenvolvimento local - todos os serviços em containers)
echo.
set /p choice="Digite 1 ou 2: "

if "%choice%"=="1" (
    echo.
    echo [OK] Configurado para Supabase REMOTO
    echo.
    echo Proximos passos:
    echo   1. Edite .env e adicione suas credenciais:
    echo      - VITE_SUPABASE_URL
    echo      - VITE_SUPABASE_ANON_KEY
    echo.
    echo   2. Inicie os containers:
    echo      docker compose up -d --pull always
    echo.
    echo   3. Acesse: http://localhost:5173
    echo   4. Email (Mailpit): http://localhost:8025
) else if "%choice%"=="2" (
    echo.
    echo [OK] Configurado para Supabase LOCAL
    echo.
    echo Proximos passos:
    echo   1. Inicie todos os serviços:
    echo      docker compose -f docker-compose.supabase.yml up -d --pull always
    echo.
    echo   2. Aguarde ~30s para os serviços iniciarem
    echo.
    echo   3. Configure as URLs no .env:
    echo      VITE_SUPABASE_URL=http://localhost:54321
    echo      VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
    echo.
    echo   4. Acesse:
    echo      - App: http://localhost:5173
    echo      - Email (Mailpit): http://localhost:8025
    echo      - REST API: http://localhost:3000
    echo      - Auth Admin: http://localhost:9999
    echo.
    echo [AVISO] Atualize os JWT_SECRET e senhas em docker-compose.supabase.yml!
) else (
    echo.
    echo [ERRO] Opção inválida
    exit /b 1
)

pause
