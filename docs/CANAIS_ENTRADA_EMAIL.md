# Canais de entrada por e-mail (suporte e monitoramento)

Como ligar a entrada de e-mail em produção: chamado aberto a partir de mensagem
de cliente e alerta de ferramenta de monitoramento (Zabbix, PRTG, Datadog)
virando chamado com correlação.

O código já está publicado. O que falta é **configuração** — e ela tem uma
armadilha descrita na seção de diagnóstico: sem o segredo, a função responde
`401` para tudo e não há erro visível em lugar nenhum.

---

## 1. Como o e-mail vira chamado

```
Provedor (SendGrid Inbound Parse)
   │  POST com o e-mail em multipart/form-data
   ▼
inbound-email            valida segredo, SPF e caixa de destino
   │  traduz para o formato do gateway
   ▼
omnichannel-gateway      normaliza, roteia para o tenant, grava a mensagem
   │
   ▼
materialize_channel_message   agrupa na conversa e abre/atualiza o chamado
```

A conversa é a unidade de agrupamento. Mensagens que caem na **mesma conversa**
viram mensagens do **mesmo chamado**; conversas distintas viram chamados
distintos. É daí que sai a diferença entre e-mail de cliente e alerta:

| Tipo de conexão | Chave da conversa | Efeito |
|---|---|---|
| `imap_smtp` | thread do e-mail (`References`), senão o `Message-ID` | cada e-mail novo é um chamado novo |
| `monitoring` | identificador do alerta (ex.: `{TRIGGER.ID}`) | repetições do mesmo alerta viram um só chamado |

> Sem a conexão de monitoramento, alerta cai na regra de e-mail comum: como
> alerta nunca é resposta a nada, não tem `References` e cai no `Message-ID`,
> que é único por mensagem. Um link oscilando 40 vezes geraria 40 chamados, e o
> e-mail de recuperação abriria um 41º em vez de fechar o original.

---

## 2. Segredos obrigatórios

Definidos em **Supabase → Project Settings → Edge Functions → Secrets**, ou via
CLI (`supabase secrets set NOME=valor`).

| Segredo | Usado por | Se faltar |
|---|---|---|
| `INBOUND_PARSE_WEBHOOK_KEY` | `inbound-email` | **toda** requisição vira `401` |
| `INBOUND_EMAIL_WEBHOOK_KEY` | `handle-inbound-email` | **toda** requisição vira `401` |
| `OMNICHANNEL_INTERNAL_KEY` | gateway e as duas acima | gateway recusa a chamada interna |

As guardas são propositalmente *fail-closed*:

```ts
if (!INBOUND_PARSE_WEBHOOK_KEY || !timingSafeEqual(suppliedKey, INBOUND_PARSE_WEBHOOK_KEY)) {
  return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
}
```

Preferir recusar a aceitar sem prova é a decisão certa — mas o efeito colateral
é que **segredo ausente e chave errada produzem a mesma resposta**. Ao
diagnosticar, confira primeiro se o segredo existe:

```bash
supabase secrets list    # mostra nomes e digests, nunca os valores
```

Gerar um valor forte:

```bash
openssl rand -hex 32
```

---

## 3. Configurar o provedor de e-mail

No Inbound Parse (SendGrid ou equivalente), aponte a **Destination URL** para:

```
https://<project-ref>.supabase.co/functions/v1/inbound-email?key=<INBOUND_PARSE_WEBHOOK_KEY>
```

Habilite o **Spam Check / SPF** nas configurações do Inbound Parse. Sem
veredito de SPF, `inbound-email` rejeita com `403` — de propósito: o cabeçalho
`From:` é trivialmente falsificável, e sem SPF qualquer um poderia alegar o
domínio de um tenant real.

---

## 4. Criar a conexão no ServiceFY

**Configurações → Operações e canais → Conexões omnichannel → Nova conexão.**

O campo **Endereço** precisa ser exatamente a caixa que recebe os e-mails —
é por ele que `inbound-email` descobre o tenant. Endereço que não casa com
nenhuma conexão habilitada é rejeitado com `unknown_destination_mailbox`.

### E-mail de cliente

Provedor **IMAP / SMTP**. Nada além de nome e endereço.

### Monitoramento

Provedor **Monitoramento (Zabbix, PRTG, Datadog…)**. Além de nome e endereço:

| Campo | Exemplo (Zabbix) | Para que serve |
|---|---|---|
| Identificador do alerta | `Trigger ID: ([0-9]+)` | agrupa repetições do mesmo alerta |
| Mensagem de recuperação | `^Resolved:` | encerra em vez de abrir outro chamado |
| Severidade (opcional) | `Severity: ([A-Za-z]+)` | vai para a categoria do chamado |
| Ao receber a recuperação | Resolver / Registrar | fecha sozinho ou deixa para o analista |

São expressões regulares aplicadas ao assunto e ao corpo, com **um grupo de
captura**. Expressão inválida não derruba a entrada: o alerta ainda vira
chamado, só não agrupa.

No template de notificação do Zabbix, inclua as macros que essas expressões
procuram:

```
Assunto:  PROBLEM: {EVENT.NAME}
Corpo:    Trigger ID: {TRIGGER.ID}
          Severity: {EVENT.SEVERITY}
          Host: {HOST.NAME}

Recuperação — assunto: Resolved: {EVENT.NAME}
Recuperação — corpo:   Trigger ID: {TRIGGER.ID}
```

O `{TRIGGER.ID}` **precisa** estar na recuperação também — é ele que liga o
aviso de normalização ao chamado aberto.

### Severidade e prioridade

Alerta nasce **P3 - Moderate**, como qualquer canal digital. A severidade não
vira prioridade automaticamente: ela é gravada na **categoria**
(`Monitoramento / Disaster`), e quem decide o que fazer com ela é o **Motor de
Automação** de cada empresa.

Isso é deliberado — mapa rígido de severidade não sobrevive à realidade de
clientes diferentes. O motor avalia `category`, `department`, `group`,
`priority`, `state` e `idle_hours`; a categoria é o veículo porque **ele não lê
tags nem descrição**.

Regra típica: *se categoria contém `Disaster`, então prioridade `P1 - Critical`
e notificar o grupo de plantão*.

---

## 5. Verificar que funciona

Sem depender do provedor de e-mail, simulando o que ele envia:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/inbound-email?key=<CHAVE>" \
  -H 'content-type: application/json' \
  -d '{
    "to": "<endereco-da-conexao>",
    "from": "zabbix@seudominio.com",
    "subject": "PROBLEM: Link WAN indisponivel",
    "text": "Trigger ID: 4711\nSeverity: Disaster\nHost: rt-core-01",
    "html": "",
    "spf": "pass",
    "envelope": { "from": "zabbix@seudominio.com" },
    "headers": "Message-ID: <teste-1@zbx>"
  }'
```

Resposta esperada:

```json
{"accepted":1,"ambiguous":0,"results":[{"status":"accepted","incidentNumber":"INC00...","...":"..."}]}
```

Repita **trocando só o `Message-ID`** e mantendo o mesmo `Trigger ID`: o
`incidentNumber` tem de ser **o mesmo**. Se mudar, a correlação não está
pegando — reveja a expressão do identificador.

Depois envie a recuperação (assunto começando com `Resolved:`, mesmo
`Trigger ID`) e confirme o fechamento:

```sql
SELECT number, state, category, resolution_code
  FROM incidents WHERE opened_via = 'monitoring'
 ORDER BY created_at DESC LIMIT 5;
```

### Interpretando as respostas

| Resposta | Significado |
|---|---|
| `401 unauthorized` | chave errada **ou segredo não configurado** |
| `403 spf_verification_failed` | SPF não retornou `pass` — habilite o Spam Check |
| `403 unknown_destination_mailbox` | o `to` não casa com nenhuma conexão habilitada |
| `202 ambiguous` | roteamento não decidiu o tenant; ver Rotas e filas |
| `{"status":"recovery_without_open_incident"}` | recuperação sem chamado aberto — ignorada de propósito |

---

## 6. Publicar as funções

Depois de qualquer mudança em `supabase/functions/`:

```bash
supabase functions deploy omnichannel-gateway --no-verify-jwt
supabase functions deploy inbound-email --no-verify-jwt
```

`--no-verify-jwt` é obrigatório nas duas: quem chama é um webhook externo, que
não tem JWT de usuário. A autenticação é a chave compartilhada mais o SPF.

Conferir o que está publicado e desde quando:

```bash
supabase functions list
```

> Vale conferir de vez em quando. Em 27/07/2026 descobrimos que
> `inbound-email` nunca havia sido publicada e o gateway estava 21 dias
> atrasado — o banco estava correto, o código de produção não.

---

## 7. Verificação automatizada

O comportamento de correlação tem cobertura executável:

```bash
# 6 cenários ao vivo contra o Postgres, em transação com ROLLBACK
docker exec -i supabase_db_servicefy psql -U postgres -d postgres \
  < scripts/monitoring-behavior-check.sql

# contratos estruturais na suíte padrão
npm run test:security
```

Os cenários cobertos: mesmo gatilho repetido vira um chamado; severidade chega
na categoria; recuperação fecha quando configurado; recuperação apenas registra
quando configurado assim; recuperação órfã não abre chamado; gatilhos distintos
seguem separados.
