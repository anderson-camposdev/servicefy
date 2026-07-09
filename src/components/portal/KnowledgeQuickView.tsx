import KnowledgePortal from '../../pages/KnowledgePortal'

interface KnowledgeQuickViewProps {
  catalogCompanyId: string
  profileId: string | null
  brand: string
}

export function KnowledgeQuickView({
  catalogCompanyId,
  profileId,
  brand,
}: KnowledgeQuickViewProps) {
  return (
    <div style={{ flex:1, overflowY:'auto', padding:'26px 28px' }}>
      <KnowledgePortal companyId={catalogCompanyId} profileId={profileId} accent={brand} />
    </div>
  )
}
