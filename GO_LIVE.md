# 🚀 Guia de Deploy e Go-Live (Produção) - ServiceFY

Este documento define o processo padrão para colocar o ServiceFY em produção, garantindo o isolamento entre ambientes e a segurança do SaaS.

## 1. Regras de Arquitetura e Segurança
* **Isolamento:** Nunca conecte o frontend local (desenvolvimento) ao banco de dados de produção.
* **Credenciais:** O arquivo `.env` de produção jamais deve ser rastreado no Git. As chaves devem ser injetadas diretamente na Vercel.
* **Chave de Serviço:** Nunca exponha a variável `service_role_key` no frontend. Utilize apenas a `anon_key`.

## 2. Configuração do Backend (Supabase Cloud)
1. **Deploy do Schema:** Aplique as migrations no projeto de produção via CLI (`supabase link` seguido de `supabase db push`).
2. **SMTP:** Configure um provedor de e-mail real (Resend, SendGrid, etc.) em `Authentication -> Providers -> Email`.
3. **URLs (Auth):** Em `Authentication -> URL Configuration`, defina a `Site URL` com o domínio oficial (ex: https://app.servicefy.com.br) e adicione-a também em `Redirect URLs`.

## 3. Configuração do Frontend (Vercel)
1. Importe o repositório do GitHub na Vercel. (Framework Preset: Vite, Build Command: npm run build).
2. Na etapa de **Environment Variables**, cadastre:
   - `VITE_SUPABASE_URL`: [Sua URL do Supabase Cloud]
   - `VITE_SUPABASE_ANON_KEY`: [Sua Chave Pública do Supabase Cloud]
3. Conclua o Deploy e configure o domínio customizado na aba Settings -> Domains.

## 4. Onboarding Zero (Preparação do Terreno)
Após o deploy, o sistema estará vazio. Antes de liberar o acesso:
1. Crie o seu usuário via frontend para registrar o tenant principal (sua empresa/MSP).
2. Acesse o Supabase Cloud (SQL Editor) e eleve o seu perfil para `sysadmin`.
3. Configure as categorias base do Catálogo de Serviços e os Grupos de Atendimento.
