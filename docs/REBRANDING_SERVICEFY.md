# Rebranding para ServiceFY

## Escopo aplicado

- nome padrão, login, navegação, rodapé, BI, catálogo e metadados HTML;
- remetentes e assuntos padrão das funções de notificação;
- documentação ativa, exemplos de API, domínio de tenant e pacote npm;
- testes de interface e contratos de webhook;
- migration 075 para atualizar o nome padrão do chatbot em bancos existentes.

## Compatibilidade preservada

Os identificadores internos `flowfy_*`, a rota `flowfy_bi`, a chave
`flowfy.tenant` e as configurações PostgreSQL `flowfy.*` permanecem como
identificadores legados. Eles não aparecem para o usuário e não foram
renomeados para evitar perda de preferências ou quebra de migrations já
aplicadas.

Webhooks passam a enviar os cabeçalhos `X-ServiceFY-Event` e
`X-ServiceFY-Signature`, mantendo temporariamente os equivalentes
`X-Flowfy-*` para consumidores existentes.

O resolvedor de tenant usa `servicefy.app` como domínio principal e continua
aceitando `flowfy.app` durante a transição.

## Ações de infraestrutura

Antes de publicar em produção, configurar DNS e certificados para
`servicefy.app`, `*.servicefy.app` e os endpoints de API utilizados. O nome do
repositório e a pasta local podem ser alterados separadamente, pois não afetam
o funcionamento do produto.
