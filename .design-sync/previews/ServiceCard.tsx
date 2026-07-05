import { ServiceCard } from 'servicefy'

const noop = () => {}

export const MinimalistDefault = () => (
  <div style={{ padding: 24, background: '#f8fafc', width: 280 }}>
    <ServiceCard
      title="Suporte de TI"
      description="Abra chamados para problemas técnicos, lentidão ou falhas em sistemas."
      iconName="Monitor"
      onClick={noop}
      fallbackAccentColor="#10b981"
    />
  </div>
)

export const MinimalistLarge = () => (
  <div style={{ padding: 24, background: '#f8fafc', display: 'flex', gap: 16 }}>
    <ServiceCard
      title="Infraestrutura"
      description="Ar-condicionado, energia elétrica e instalações prediais."
      iconName="Building2"
      onClick={noop}
      fallbackAccentColor="#6366f1"
      uiConfig={{ iconType: 'lucide', card_settings: { icon_size: 'large' } }}
    />
    <ServiceCard
      title="Segurança"
      description="Acessos, senhas e credenciais corporativas."
      iconName="ShieldAlert"
      onClick={noop}
      fallbackAccentColor="#ef4444"
      uiConfig={{ iconType: 'lucide', card_settings: { icon_size: 'large' } }}
    />
  </div>
)

export const Modern3D = () => (
  <div style={{ padding: 24, background: '#f1f5f9', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, width: 520 }}>
    <ServiceCard
      title="Solicitar Serviço"
      description="Equipamentos, licenças e acessos."
      iconName="ShoppingCart"
      defaultTheme="modern_3d"
      onClick={noop}
      fallbackAccentColor="#0ea5e9"
    />
    <ServiceCard
      title="Reportar Problema"
      description="Algo parou de funcionar? Abra um incidente."
      iconName="AlertTriangle"
      defaultTheme="modern_3d"
      onClick={noop}
      fallbackAccentColor="#f59e0b"
    />
    <ServiceCard
      title="Base de Conhecimento"
      description="Tutoriais, FAQs e guias de uso."
      iconName="BookOpen"
      defaultTheme="modern_3d"
      onClick={noop}
      fallbackAccentColor="#8b5cf6"
    />
    <ServiceCard
      title="RH & Benefícios"
      description="Férias, declarações e benefícios."
      iconName="Users"
      defaultTheme="modern_3d"
      onClick={noop}
      fallbackAccentColor="#10b981"
    />
  </div>
)

export const WithEmoji = () => (
  <div style={{ padding: 24, background: '#f8fafc', display: 'flex', gap: 16 }}>
    <ServiceCard
      title="Compras"
      iconName="🛒"
      description="Materiais de escritório e mobiliário."
      onClick={noop}
      uiConfig={{ iconType: 'emoji' }}
      fallbackAccentColor="#f59e0b"
    />
    <ServiceCard
      title="Audiovisual"
      iconName="📽️"
      description="Projetores, TVs e equipamentos de som."
      onClick={noop}
      uiConfig={{ iconType: 'emoji' }}
      fallbackAccentColor="#6366f1"
    />
  </div>
)

export const ImageFullcard = () => (
  <div style={{ padding: 24, background: '#e2e8f0', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
    <ServiceCard
      title="Notebook"
      defaultTheme="image_fullcard"
      iconName="https://img.icons8.com/fluency/96/laptop.png"
      onClick={noop}
      uiConfig={{ iconType: 'image', card_settings: { icon_bg_color: '#f0fdf4', label_bg_color: 'rgba(16,185,129,0.9)' } }}
      className="w-36 h-36"
    />
    <ServiceCard
      title="Impressora"
      defaultTheme="image_fullcard"
      iconName="https://img.icons8.com/fluency/96/printer.png"
      onClick={noop}
      uiConfig={{ iconType: 'image', card_settings: { icon_bg_color: '#eff6ff', label_bg_color: 'rgba(59,130,246,0.9)' } }}
      className="w-36 h-36"
    />
    <ServiceCard
      title="Headset"
      defaultTheme="image_fullcard"
      iconName="https://img.icons8.com/fluency/96/headphones.png"
      onClick={noop}
      uiConfig={{ iconType: 'image', card_settings: { icon_bg_color: '#fdf4ff', label_bg_color: 'rgba(168,85,247,0.9)' } }}
      className="w-36 h-36"
    />
  </div>
)

export const DisabledState = () => (
  <div style={{ padding: 24, background: '#f8fafc', display: 'flex', gap: 16 }}>
    <ServiceCard
      title="Serviço Indisponível"
      description="Este serviço está temporariamente fora do ar."
      iconName="XCircle"
      onClick={noop}
      disabled
      fallbackAccentColor="#94a3b8"
    />
    <ServiceCard
      title="Manutenção"
      description="Em manutenção programada até amanhã."
      iconName="Wrench"
      onClick={noop}
      disabled
      defaultTheme="modern_3d"
      fallbackAccentColor="#f59e0b"
    />
  </div>
)
