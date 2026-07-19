# Baseline de autenticação do ServiceFY

Esta política preserva o ritmo de desenvolvimento sem tratar controles de
produção como opções implícitas.

## Política por ambiente

| Controle | Desenvolvimento | Homologação | Produção futura |
|---|---|---|---|
| Login por senha | Permitido | Permitido | Configurável por tenant |
| SSO Google/Microsoft | Opcional | Em validação | Recomendado |
| MFA | MFA opcional em desenvolvimento | Piloto por papel | Obrigatório para contas privilegiadas após homologação |
| Confirmação de e-mail | Não bloqueante | Testar fluxo completo | Obrigatória após plano de migração |
| Timeout de sessão | Padrão do Supabase | Validar 8h/24h | 8h inativa, 24h absoluta |

Nenhuma ativação global de MFA, confirmação de e-mail ou bloqueio de senha deve
ser feita diretamente em produção. A mudança passa primeiro por homologação,
inclui uma conta administrativa de contingência e exige teste de recuperação.

## Controles já exigidos

- JWT e refresh token são emitidos pelo Supabase Auth.
- Perfil e tenant desativados deixam de resolver papel e empresa nas policies.
- SSO-only é aplicado no servidor pelo hook de verificação de senha.
- JIT aceita somente domínio verificado e cria exclusivamente `end_user`.
- `service_role` permanece restrita a Edge Functions e jobs internos.
- O container web publica CSP e headers defensivos sem habilitar CORS global.
- Novas senhas exigem no mínimo 12 caracteres no Supabase Auth.
- Auto cadastro público permanece desabilitado; onboarding ocorre por convite
  administrativo governado.
- Trocas sensíveis de senha exigem sessão recente e e-mails de autenticação têm
  intervalo mínimo de 60 segundos.

## Aplicação da configuração

`supabase/config.toml` é a fonte versionada para ambientes locais e para o
comando de sincronização da configuração do projeto. Alterar esse arquivo não
comprova, sozinho, que o Supabase Cloud recebeu a política. Em cada ambiente:

1. confirmar o projeto vinculado;
2. revisar o diff de configuração;
3. aplicar a configuração com a CLI;
4. validar login por senha, convite administrativo e recuperação;
5. registrar evidência dos valores no painel do Supabase.

O endurecimento não ativa MFA, confirmação obrigatória de e-mail ou CAPTCHA.
Esses controles continuam sujeitos ao rollout gradual descrito abaixo.

Não executar `supabase config push` diretamente a partir de uma estação local:
o mesmo arquivo contém `site_url` e redirects de desenvolvimento. No Cloud,
aplicar somente os controles de Auth acima ou gerar uma configuração específica
do ambiente com os hosts oficiais revisados.

## Checklist do Supabase Cloud

As configurações do arquivo local não comprovam o estado do Supabase Cloud.
Antes de produção, registrar evidência para:

- hook `password_verification_attempt` habilitado;
- redirect URLs limitadas aos hosts oficiais;
- refresh token rotation habilitada;
- sign-up e confirmação de e-mail conforme a fase de rollout;
- proteção contra senha comprometida;
- limites de autenticação e CAPTCHA;
- MFA/TOTP preparado, mas não obrigatório durante o refinamento funcional.

## Critérios para ativar MFA obrigatório

1. Fluxos de inscrição, recuperação e troca de dispositivo validados.
2. Conta de contingência protegida e auditada.
3. Testes E2E para cadastro, desafio, recuperação e desativação.
4. Piloto em homologação com sysadmin e company_admin.
5. Comunicação e suporte definidos antes da ativação por tenant.
