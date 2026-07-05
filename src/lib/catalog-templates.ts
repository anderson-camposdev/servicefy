// Biblioteca de templates pré-construídos para catálogos de TI / Microinformática.
// Esses dados são estáticos — não vêm do banco. O admin importa o que quiser para
// o catálogo da empresa via CatalogManager → "Biblioteca".

export interface IncidentServiceTemplate {
  name: string
  icon: string
  /** Nomes que batem com system_symptoms (preferência: específicos da migration 051,
   *  fallback para os genéricos da migration 023). */
  symptoms: string[]
}

export interface IncidentCategoryTemplate {
  id: string
  name: string
  icon: string
  description: string
  services: IncidentServiceTemplate[]
}

export interface RequestItemTemplate {
  name: string
  icon: string
  description: string
}

export interface RequestCategoryTemplate {
  id: string
  name: string
  icon: string
  description: string
  items: RequestItemTemplate[]
}

// ─── Templates de Incidentes ──────────────────────────────────────────────────

export const INCIDENT_CATALOG_TEMPLATES: IncidentCategoryTemplate[] = [
  {
    id: 'tpl-redes',
    name: 'Redes e Conectividade',
    icon: '🌐',
    description: 'Internet, Wi-Fi, VPN, e-mail e comunicação corporativa',
    services: [
      {
        name: 'Link de Internet',
        icon: '🌐',
        symptoms: ['Sem Conexão com a Internet', 'Internet Lenta ou Instável', 'Indisponibilidade / Fora do Ar', 'Lentidão / Performance'],
      },
      {
        name: 'Rede Local / Wi-Fi',
        icon: '📡',
        symptoms: ['Wi-Fi Sem Sinal', 'Sem Acesso à Rede Interna', 'Drive Compartilhado Inacessível', 'Indisponibilidade / Fora do Ar'],
      },
      {
        name: 'VPN Corporativa',
        icon: '🔒',
        symptoms: ['VPN Não Conecta', 'Erro / Falha', 'Falha de Acesso / Permissão'],
      },
      {
        name: 'E-mail / Comunicação',
        icon: '📧',
        symptoms: ['E-mail Não Envia / Não Recebe', 'Microsoft Teams com Falha', 'Comportamento Inesperado'],
      },
    ],
  },
  {
    id: 'tpl-sistemas',
    name: 'Sistemas e Aplicações',
    icon: '💻',
    description: 'ERP, Microsoft 365, sistemas internos e softwares corporativos',
    services: [
      {
        name: 'ERP / Sistema de Gestão',
        icon: '📊',
        symptoms: ['Sistema Totalmente Fora do Ar', 'Sistema Extremamente Lento', 'Erro ao Salvar / Gravar Dados', 'Relatório com Erro ou Incorreto', 'Indisponibilidade / Fora do Ar', 'Lentidão / Performance'],
      },
      {
        name: 'Microsoft 365 / Office',
        icon: '📄',
        symptoms: ['Licença Expirada ou Inválida', 'OneDrive / SharePoint Sem Sincronizar', 'Erro / Falha', 'Comportamento Inesperado'],
      },
      {
        name: 'Sistemas Internos / Web',
        icon: '🏢',
        symptoms: ['Erro de Login / Autenticação', 'Página Não Carrega / Timeout', 'Acesso Negado ao Sistema', 'Falha de Acesso / Permissão'],
      },
    ],
  },
  {
    id: 'tpl-hardware',
    name: 'Hardware e Periféricos',
    icon: '🖥️',
    description: 'Computadores, notebooks, impressoras, monitores e periféricos',
    services: [
      {
        name: 'Computador / Notebook',
        icon: '💻',
        symptoms: ['Computador Não Liga', 'Tela Azul (BSOD)', 'Superaquecimento', 'Sistema Extremamente Lento', 'Bateria do Notebook Não Carrega', 'Lentidão / Performance', 'Quebra / Dano Físico'],
      },
      {
        name: 'Impressoras',
        icon: '🖨️',
        symptoms: ['Impressora de Rede Offline', 'Papel Atolado na Impressora', 'Impressão com Qualidade Ruim', 'Erro / Falha', 'Quebra / Dano Físico'],
      },
      {
        name: 'Monitor, Teclado e Mouse',
        icon: '🖱️',
        symptoms: ['Monitor Sem Imagem / Tela Preta', 'Teclado ou Mouse Sem Resposta', 'Erro / Falha', 'Quebra / Dano Físico'],
      },
    ],
  },
  {
    id: 'tpl-seguranca',
    name: 'Segurança e Acessos',
    icon: '🔐',
    description: 'Senhas bloqueadas, permissões, contas e incidentes de segurança',
    services: [
      {
        name: 'Senha / Conta Bloqueada',
        icon: '🔑',
        symptoms: ['Senha Bloqueada', 'Não Recebe Código 2FA / MFA', 'Falha de Acesso / Permissão'],
      },
      {
        name: 'Permissões de Acesso',
        icon: '🔒',
        symptoms: ['Acesso Negado ao Sistema', 'Sem Permissão em Arquivo ou Pasta', 'Falha de Acesso / Permissão'],
      },
      {
        name: 'Incidente de Segurança',
        icon: '🚨',
        symptoms: ['Atividade Suspeita na Conta', 'Comportamento Inesperado', 'Erro / Falha'],
      },
    ],
  },
]

// ─── Templates de Incidentes — RH ────────────────────────────────────────────

export const INCIDENT_HR_TEMPLATES: IncidentCategoryTemplate[] = [
  {
    id: 'tpl-rh-folha',
    name: 'Folha de Pagamento',
    icon: '💰',
    description: 'Problemas com holerite, descontos, salário, FGTS e rescisão',
    services: [
      {
        name: 'Holerite e Descontos',
        icon: '📄',
        symptoms: ['Holerite / Contracheque Incorreto', 'Desconto Indevido na Folha de Pagamento', 'Salário Não Creditado no Prazo'],
      },
      {
        name: 'FGTS, 13º e Rescisão',
        icon: '📋',
        symptoms: ['FGTS com Divergência', '13º Salário com Erro', 'Rescisão com Divergência de Valores'],
      },
    ],
  },
  {
    id: 'tpl-rh-beneficios',
    name: 'Benefícios',
    icon: '🏥',
    description: 'Problemas com VA, VT, plano de saúde, odonto e seguro de vida',
    services: [
      {
        name: 'Vale Alimentação e Transporte',
        icon: '🍽️',
        symptoms: ['Vale Alimentação / Refeição Não Creditado', 'Vale Transporte Incorreto ou Não Recebido'],
      },
      {
        name: 'Plano de Saúde e Odonto',
        icon: '🏥',
        symptoms: ['Plano de Saúde com Problema de Cobertura', 'Plano Odontológico com Problema', 'Seguro de Vida com Erro no Cadastro'],
      },
    ],
  },
  {
    id: 'tpl-rh-ponto',
    name: 'Ponto e Jornada',
    icon: '🕐',
    description: 'Falhas no registro de ponto, banco de horas e férias',
    services: [
      {
        name: 'Registro de Ponto',
        icon: '🕐',
        symptoms: ['Ponto Eletrônico Não Registra', 'Banco de Horas com Saldo Incorreto', 'Ausência / Abono Não Processado'],
      },
      {
        name: 'Férias',
        icon: '🏖️',
        symptoms: ['Férias Lançadas de Forma Incorreta', 'Ausência / Abono Não Processado'],
      },
    ],
  },
  {
    id: 'tpl-rh-sistemas',
    name: 'Sistemas e Portal RH',
    icon: '💻',
    description: 'Acesso ao portal, emissão de documentos e eSocial',
    services: [
      {
        name: 'Portal do Colaborador',
        icon: '🔒',
        symptoms: ['Acesso ao Portal / Sistema de RH Negado', 'Erro ao Emitir Documento no Portal RH', 'Erro de Login / Autenticação'],
      },
      {
        name: 'Obrigações Legais (eSocial / CAGED)',
        icon: '🗂️',
        symptoms: ['eSocial / CAGED com Erro', 'Relatório com Erro ou Incorreto'],
      },
    ],
  },
]

// ─── Templates de Requisições ─────────────────────────────────────────────────

export const REQUEST_HR_TEMPLATES: RequestCategoryTemplate[] = [
  {
    id: 'tpl-req-rh-documentos',
    name: 'Documentos e Certidões',
    icon: '📄',
    description: 'Declarações, informes e comprovantes emitidos pelo RH',
    items: [
      { name: 'Declaração de Vínculo Empregatício', icon: '📃', description: 'Comprovante de que o colaborador é funcionário ativo da empresa' },
      { name: 'Informe de Rendimentos (IR)',         icon: '🧾', description: 'Documento anual para declaração de imposto de renda' },
      { name: 'Holerite / Contracheque',             icon: '💵', description: 'Cópia de holerite de mês específico' },
      { name: 'Carta de Referência',                 icon: '✉️', description: 'Carta de referência profissional emitida pela empresa' },
      { name: 'Declaração de Salário',               icon: '💼', description: 'Comprovante de renda para fins bancários ou imobiliários' },
      { name: 'Histórico de Férias',                 icon: '🏖️', description: 'Extrato de períodos de férias gozadas e saldo disponível' },
      { name: 'Extrato de FGTS',                     icon: '🏦', description: 'Orientação para acesso ao saldo do FGTS via aplicativo' },
    ],
  },
  {
    id: 'tpl-req-rh-beneficios',
    name: 'Benefícios',
    icon: '🏥',
    description: 'Inclusão, atualização e cancelamento de benefícios',
    items: [
      { name: 'Inclusão no Plano de Saúde',          icon: '🏥', description: 'Novo colaborador ou inclusão de dependente no plano de saúde' },
      { name: 'Atualização de Dependentes (Saúde)',   icon: '👨‍👩‍👧', description: 'Adicionar, alterar ou remover dependente do plano de saúde' },
      { name: 'Inclusão no Plano Odontológico',       icon: '🦷', description: 'Adesão ou inclusão de dependente no plano odontológico' },
      { name: 'Atualização do Vale Transporte',       icon: '🚌', description: 'Alteração de linhas, valor ou endereço de deslocamento' },
      { name: 'Atualização do Vale Alimentação',      icon: '🍽️', description: 'Ajuste de valor ou modalidade de vale alimentação / refeição' },
      { name: 'Adesão ao Seguro de Vida',             icon: '🛡️', description: 'Cadastro ou atualização de beneficiários do seguro de vida' },
      { name: 'Auxílio Educação / Bolsa de Estudos',  icon: '🎓', description: 'Solicitação de reembolso ou desconto em instituição parceira' },
      { name: 'Auxílio Home Office',                  icon: '🏠', description: 'Solicitação de auxílio para trabalho remoto (internet, ergonomia)' },
    ],
  },
  {
    id: 'tpl-req-rh-jornada',
    name: 'Jornada e Férias',
    icon: '📅',
    description: 'Agendamento de férias, correção de ponto e banco de horas',
    items: [
      { name: 'Agendamento de Férias',               icon: '🏖️', description: 'Solicitação de período de férias para aprovação da gestão' },
      { name: 'Adiantamento de Férias',               icon: '⏩', description: 'Solicitação de antecipação do período de férias' },
      { name: 'Venda de Férias (Abono Pecuniário)',    icon: '💵', description: 'Conversão de 1/3 das férias em pagamento em dinheiro' },
      { name: 'Correção de Registro de Ponto',        icon: '🕐', description: 'Ajuste de batida esquecida ou marcação incorreta' },
      { name: 'Solicitação de Abono de Falta',        icon: '📋', description: 'Justificativa e abono de ausência não prevista' },
      { name: 'Ajuste de Banco de Horas',             icon: '⏰', description: 'Solicitação de compensação ou saque de banco de horas' },
      { name: 'Licença Maternidade / Paternidade',    icon: '👶', description: 'Solicitação e formalização de licença parental' },
      { name: 'Licença Médica / Afastamento',         icon: '🏥', description: 'Registro de afastamento por motivo de saúde com CID' },
    ],
  },
  {
    id: 'tpl-req-rh-pessoas',
    name: 'Admissão, Carreira e Desligamento',
    icon: '👥',
    description: 'Onboarding, promoções, transferências e offboarding',
    items: [
      { name: 'Abertura de Processo Seletivo',        icon: '🔍', description: 'Requisição de vaga para contratação interna ou externa' },
      { name: 'Onboarding de Novo Colaborador',       icon: '🤝', description: 'Integração, documentação e setup para novo funcionário' },
      { name: 'Transferência entre Departamentos',    icon: '🔄', description: 'Movimentação interna de colaborador para outra área' },
      { name: 'Solicitação de Promoção / Progressão', icon: '📈', description: 'Proposta de mudança de cargo ou nível salarial' },
      { name: 'Alteração de Dados Cadastrais',        icon: '✏️', description: 'Atualização de nome, endereço, conta bancária ou estado civil' },
      { name: 'Carta de Oferta / Proposta Salarial',  icon: '📩', description: 'Emissão de proposta formal para candidato selecionado' },
      { name: 'Solicitação de Desligamento',          icon: '🚪', description: 'Formalização de pedido de demissão ou processo de offboarding' },
    ],
  },
  {
    id: 'tpl-req-rh-desenvolvimento',
    name: 'Treinamento e Desenvolvimento',
    icon: '🎓',
    description: 'Capacitações, cursos, avaliações e plano de carreira',
    items: [
      { name: 'Solicitação de Treinamento Interno',   icon: '📚', description: 'Inscrição em treinamento oferecido pela empresa' },
      { name: 'Reembolso de Curso Externo',           icon: '🏫', description: 'Reembolso de curso, pós-graduação ou certificação aprovada' },
      { name: 'Inscrição em Plataforma de Cursos',    icon: '💻', description: 'Acesso a plataforma de e-learning corporativa (ex: Alura, Udemy)' },
      { name: 'Avaliação de Desempenho',              icon: '⭐', description: 'Início ou acompanhamento de ciclo de avaliação de performance' },
      { name: 'Plano de Desenvolvimento Individual',  icon: '🗺️', description: 'Criação ou revisão do PDI com a liderança e RH' },
      { name: 'Mentoria / Coaching Interno',          icon: '🧑‍🏫', description: 'Solicitação de programa de mentoria com liderança interna' },
    ],
  },
]

export const REQUEST_CATALOG_TEMPLATES: RequestCategoryTemplate[] = [
  {
    id: 'tpl-req-software',
    name: 'Software e Licenças',
    icon: '📦',
    description: 'Softwares, licenças e ferramentas de produtividade',
    items: [
      { name: 'Nova licença Microsoft 365',    icon: '📄', description: 'Licença para Word, Excel, PowerPoint e Outlook' },
      { name: 'Instalar software específico',  icon: '💿', description: 'Instalação de software aprovado pelo gestor' },
      { name: 'Adobe / Ferramentas Criativas', icon: '🎨', description: 'Licença para Photoshop, Illustrator ou afins' },
      { name: 'Antivírus Corporativo',         icon: '🛡️', description: 'Instalação ou renovação do antivírus' },
      { name: 'Atualizar versão de software',  icon: '🔄', description: 'Atualização de aplicação já instalada' },
    ],
  },
  {
    id: 'tpl-req-hardware',
    name: 'Hardware e Equipamentos',
    icon: '🖥️',
    description: 'Notebooks, monitores, periféricos e acessórios de trabalho',
    items: [
      { name: 'Notebook novo / substituição', icon: '💻', description: 'Aquisição ou troca de notebook' },
      { name: 'Monitor adicional',            icon: '🖥️', description: 'Monitor extra para aumentar produtividade' },
      { name: 'Teclado e mouse',              icon: '⌨️', description: 'Periféricos de entrada para o posto de trabalho' },
      { name: 'Headset para reuniões',        icon: '🎧', description: 'Fone com microfone para videoconferências' },
      { name: 'Webcam',                       icon: '📷', description: 'Câmera para reuniões e colaboração remota' },
      { name: 'Suporte ergonômico',           icon: '🪑', description: 'Suporte regulável para notebook ou monitor' },
    ],
  },
  {
    id: 'tpl-req-acessos',
    name: 'Acessos e Contas',
    icon: '🔑',
    description: 'Criação de contas, acessos a sistemas e permissões',
    items: [
      { name: 'Criar conta de usuário',         icon: '👤', description: 'Novo usuário no Active Directory / domínio' },
      { name: 'Acesso a sistema interno',        icon: '🏢', description: 'Permissão em ERP ou sistema corporativo' },
      { name: 'VPN corporativa',                 icon: '🔒', description: 'Configuração de acesso remoto via VPN' },
      { name: 'E-mail profissional',             icon: '📧', description: 'Criação ou configuração de caixa de e-mail' },
      { name: 'Permissão em pasta / drive',      icon: '📁', description: 'Acesso a diretório compartilhado em rede' },
      { name: 'Remoção / Bloqueio de usuário',   icon: '🚫', description: 'Desativação de conta por desligamento ou transferência' },
    ],
  },
  {
    id: 'tpl-req-infra',
    name: 'Infraestrutura',
    icon: '🏢',
    description: 'Rede física, telefonia e infraestrutura do ambiente de trabalho',
    items: [
      { name: 'Ponto de rede em nova mesa',        icon: '🔌', description: 'Extensão de rede cabeada para novo posto de trabalho' },
      { name: 'Impressora em novo local',          icon: '🖨️', description: 'Instalação ou realocação de impressora' },
      { name: 'Configurar Wi-Fi corporativo',      icon: '📡', description: 'Conexão de dispositivo à rede sem fio corporativa' },
      { name: 'Ramal IP / Telefone corporativo',   icon: '📞', description: 'Configuração de ramal VoIP para o posto' },
      { name: 'Microsoft Teams / Videoconferência',icon: '💬', description: 'Configuração de ferramenta de colaboração' },
    ],
  },
]
