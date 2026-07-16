# Teste SMTP local

Este fluxo usa o Mailpit para validar o handshake SMTP e visualizar o e-mail de teste sem enviar mensagens para destinatários reais.

## Iniciar o Mailpit

Na raiz do projeto:

```powershell
docker compose -f docker-compose.smtp.yml up -d
```

Abra a caixa de entrada em <http://localhost:8025>.

## Iniciar o Supabase local

Se o ambiente local ainda não estiver em execução:

```powershell
supabase start
supabase functions serve test-smtp-connection --env-file supabase/functions/.env.local
```

O arquivo `supabase/functions/.env.local` deve conter os valores locais do projeto, sem ser versionado:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<chave anon local>
SUPABASE_SERVICE_ROLE_KEY=<chave service_role local>
```

## Preencher o formulário

Use estes valores em **Configurações de E-mail**:

| Campo | Valor |
| --- | --- |
| Host | `host.docker.internal` |
| Porta | `1025` |
| Usuário | `local-user` |
| Senha | `local-password` |
| E-mail de Origem | `servicefy@local.test` |
| Nome de Origem | `ServiceFY Local` |
| Tipo de Criptografia | `none` |

O Mailpit não exige usuário ou senha. O formulário exige esses campos, por isso os valores locais acima são aceitos pelo servidor de teste e não representam credenciais reais.

Clique em **Testar Conexão**. O retorno esperado é:

> Conexão estabelecida com sucesso. E-mail de teste enviado.

Depois, confirme a mensagem em <http://localhost:8025>.

## Encerrar e limpar

```powershell
docker compose -f docker-compose.smtp.yml down
```

Para apagar também as mensagens armazenadas:

```powershell
docker compose -f docker-compose.smtp.yml down -v
```

Nunca use `host.docker.internal` ou credenciais locais em produção. A Edge Function remota deve continuar usando um host SMTP público e credenciais reais de um ambiente de teste controlado.
