import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Search, X } from 'lucide-react'
import CatalogIcon from '../../pages/CatalogIcon'
import { matchesCatalogSearch } from '../../lib/catalog-discovery'
import type {
  CatalogCategoryRow, CatalogServiceRow, CatalogServiceSymptomRow,
  RequestCategoryRow, RequestSubcategoryRow, RequestItemRow, DepartmentRow,
} from '../../lib/database.types'

interface PortalConfig {
  cardLayout: 'grid' | 'list'
  companyName: string
  portalTitle: string
  browseCats: any[]
  incCats: any[]
  reqCats: any[]
}

interface UserServiceCatalogProps {
  screen: string
  catalogLoading: boolean
  visibleIncCategories: CatalogCategoryRow[]
  visibleReqCategories: RequestCategoryRow[]
  services: CatalogServiceRow[]
  serviceSymptoms: CatalogServiceSymptomRow[]
  reqSubcategories: RequestSubcategoryRow[]
  reqItems: RequestItemRow[]
  selIncCat: any | null
  selReqCat: any | null
  dbSelIncCat: CatalogCategoryRow | null
  dbSelIncService: CatalogServiceRow | null
  dbSelReqCat: RequestCategoryRow | null
  dbSelReqSubcat: RequestSubcategoryRow | null
  catalogIconSize: number
  catalogFontSize: string
  customIconBg?: string
  customPillBg?: string
  customPillColor?: string
  selDept: DepartmentRow | null
  config: PortalConfig
  categories: CatalogCategoryRow[]
  reqCategories: RequestCategoryRow[]
  onSelectIncCat: (c: CatalogCategoryRow) => void
  onSelectLegacyIncCat: (c: any) => void
  onSelectIncService: (s: CatalogServiceRow) => void
  onSelectIncSymptom: (s: CatalogServiceSymptomRow) => void
  onSelectLegacyIncSymptom: (s: string) => void
  onSelectReqCat: (c: RequestCategoryRow) => void
  onSelectLegacyReqCat: (c: any) => void
  onSelectReqSubcat: (s: RequestSubcategoryRow) => void
  onSelectLegacyReqSubcatOthers: () => void
  onSelectReqItem: (it: RequestItemRow) => void
  onSelectLegacyReqItem: (it: string) => void
}

const OTHERS_SUBCAT_ID = '__others__'

export function UserServiceCatalog(props: UserServiceCatalogProps) {
  const [query, setQuery] = useState('')
  useEffect(() => setQuery(''), [props.screen])

  const content = useMemo(() => {
    const {
      screen, visibleIncCategories, visibleReqCategories, services, serviceSymptoms,
      reqSubcategories, reqItems, dbSelIncCat, dbSelIncService, dbSelReqCat,
      dbSelReqSubcat, selIncCat, selReqCat,
    } = props

    if (screen === 'inc-cats') {
      return {
        eyebrow: 'Incidente',
        title: 'Onde está o problema?',
        description: 'Escolha a área afetada para direcionarmos o atendimento à equipe certa.',
        placeholder: 'Buscar área ou serviço',
        cards: visibleIncCategories
          .filter(category => matchesCatalogSearch(
            query,
            category.name,
            category.description,
            ...services.filter(service => service.category_id === category.id).map(service => service.name),
          ))
          .map(category => ({
            id: category.id,
            title: category.name,
            description: category.description || 'Serviços e sistemas desta área',
            meta: plural(services.filter(service => service.category_id === category.id).length, 'serviço', 'serviços'),
            icon: category.icon,
            onClick: () => props.onSelectIncCat(category),
          })),
        legacy: props.categories.length === 0 && !props.selDept?.id
          ? props.config.incCats
              .filter(category => matchesCatalogSearch(query, category.name, ...category.symptoms))
              .map(category => ({
                id: category.id,
                title: category.name,
                description: 'Problemas e indisponibilidades desta área',
                meta: plural(category.symptoms.length, 'sintoma', 'sintomas'),
                emoji: category.emoji,
                onClick: () => props.onSelectLegacyIncCat(category),
              }))
          : [],
      }
    }

    if (screen === 'inc-services' && dbSelIncCat) {
      const cards = services
        .filter(service => service.category_id === dbSelIncCat.id)
        .filter(service => matchesCatalogSearch(query, service.name, service.description))
        .map(service => ({
          id: service.id,
          title: service.name,
          description: service.description || `Serviço de ${dbSelIncCat.name}`,
          meta: plural(serviceSymptoms.filter(item => item.service_id === service.id).length, 'situação', 'situações'),
          icon: service.icon,
          onClick: () => props.onSelectIncService(service),
        }))
      return {
        eyebrow: dbSelIncCat.name,
        title: 'Qual serviço foi afetado?',
        description: 'Selecione o serviço para ver as situações de atendimento disponíveis.',
        placeholder: 'Buscar serviço',
        cards,
        legacy: [],
      }
    }

    if (screen === 'inc-symptoms' && (dbSelIncService || selIncCat)) {
      const cards = dbSelIncService
        ? serviceSymptoms
            .filter(item => item.service_id === dbSelIncService.id)
            .filter(item => matchesCatalogSearch(query, item.symptom?.name, dbSelIncService.name))
            .map(item => ({
              id: item.id,
              title: item.symptom?.name || 'Situação não identificada',
              description: item.group?.name ? `Atendimento por ${item.group.name}` : 'A equipe responsável será definida automaticamente',
              meta: item.sla_hours ? `Prazo estimado: ${item.sla_hours}h` : 'Prazo conforme o SLA',
              icon: item.symptom?.icon,
              onClick: () => props.onSelectIncSymptom(item),
            }))
        : []
      const legacy = !dbSelIncService
        ? (selIncCat?.symptoms || [])
            .filter((symptom: string) => matchesCatalogSearch(query, symptom))
            .map((symptom: string) => ({
              id: symptom,
              title: symptom,
              description: 'Descreva os detalhes na próxima etapa',
              meta: 'Incidente',
              onClick: () => props.onSelectLegacyIncSymptom(symptom),
            }))
        : []
      return {
        eyebrow: dbSelIncService?.name || selIncCat?.name || 'Incidente',
        title: 'O que está acontecendo?',
        description: 'Escolha a opção que mais se aproxima do que você está enfrentando.',
        placeholder: 'Buscar situação',
        cards,
        legacy,
      }
    }

    if (screen === 'req-cats') {
      return {
        eyebrow: 'Solicitação',
        title: 'O que você precisa?',
        description: 'Navegue pelas categorias ou pesquise pelo serviço que deseja solicitar.',
        placeholder: 'Buscar categoria, acesso ou equipamento',
        cards: visibleReqCategories
          .filter(category => matchesCatalogSearch(
            query,
            category.name,
            category.description,
            ...reqItems.filter(item => belongsToRequestCategory(item, category.id, reqSubcategories)).map(item => item.name),
          ))
          .map(category => ({
            id: category.id,
            title: category.name,
            description: category.description || 'Solicitações disponíveis nesta categoria',
            meta: plural(reqItems.filter(item => belongsToRequestCategory(item, category.id, reqSubcategories)).length, 'item', 'itens'),
            icon: category.icon,
            onClick: () => props.onSelectReqCat(category),
          })),
        legacy: props.reqCategories.length === 0 && !props.selDept?.id
          ? props.config.reqCats
              .filter(category => matchesCatalogSearch(query, category.name, ...category.items))
              .map(category => ({
                id: category.id,
                title: category.name,
                description: 'Serviços disponíveis nesta categoria',
                meta: plural(category.items.length, 'item', 'itens'),
                emoji: category.emoji,
                onClick: () => props.onSelectLegacyReqCat(category),
              }))
          : [],
      }
    }

    if (screen === 'req-subcats' && dbSelReqCat) {
      const cards = reqSubcategories
        .filter(subcategory => subcategory.category_id === dbSelReqCat.id && subcategory.active)
        .filter(subcategory => matchesCatalogSearch(query, subcategory.name, subcategory.description))
        .map(subcategory => ({
          id: subcategory.id,
          title: subcategory.name,
          description: subcategory.description || `Serviços de ${dbSelReqCat.name}`,
          meta: plural(reqItems.filter(item => item.request_subcategory_id === subcategory.id).length, 'item', 'itens'),
          icon: subcategory.icon,
          onClick: () => props.onSelectReqSubcat(subcategory),
        }))
      const orphanCount = reqItems.filter(item => !item.request_subcategory_id && item.request_category_id === dbSelReqCat.id).length
      if (orphanCount > 0 && matchesCatalogSearch(query, 'Outros', 'Demais solicitações')) {
        cards.push({
          id: OTHERS_SUBCAT_ID,
          title: 'Outros',
          description: 'Demais solicitações desta categoria',
          meta: plural(orphanCount, 'item', 'itens'),
          icon: 'FolderOpen',
          onClick: props.onSelectLegacyReqSubcatOthers,
        })
      }
      return {
        eyebrow: dbSelReqCat.name,
        title: 'Escolha uma subcategoria',
        description: 'Isso ajuda a encontrar o item certo com menos etapas.',
        placeholder: 'Buscar subcategoria',
        cards,
        legacy: [],
      }
    }

    const requestItems = dbSelReqCat
      ? dbSelReqSubcat && dbSelReqSubcat.id !== OTHERS_SUBCAT_ID
        ? reqItems.filter(item => item.request_subcategory_id === dbSelReqSubcat.id)
        : dbSelReqSubcat?.id === OTHERS_SUBCAT_ID
          ? reqItems.filter(item => !item.request_subcategory_id && item.request_category_id === dbSelReqCat.id)
          : reqItems.filter(item => belongsToRequestCategory(item, dbSelReqCat.id, reqSubcategories))
      : []
    const cards = requestItems
      .filter(item => matchesCatalogSearch(query, item.name, item.description, item.group?.name))
      .map(item => ({
        id: item.id,
        title: item.name,
        description: item.description || 'Preencha os dados necessários na próxima etapa',
        meta: item.group?.name ? `Atendimento por ${item.group.name}` : 'Solicitação de serviço',
        icon: item.icon,
        onClick: () => props.onSelectReqItem(item),
      }))
    const legacy = !dbSelReqCat
      ? (selReqCat?.items || [])
          .filter((item: string) => matchesCatalogSearch(query, item))
          .map((item: string) => ({
            id: item,
            title: item,
            description: 'Preencha os dados necessários na próxima etapa',
            meta: 'Solicitação de serviço',
            onClick: () => props.onSelectLegacyReqItem(item),
          }))
      : []
    return {
      eyebrow: dbSelReqSubcat?.name || dbSelReqCat?.name || selReqCat?.name || 'Solicitação',
      title: 'Selecione o item desejado',
      description: 'Confira a descrição antes de avançar para o formulário.',
      placeholder: 'Buscar item do catálogo',
      cards,
      legacy,
    }
  }, [props, query])

  if (props.catalogLoading) {
    return <CatalogLoading />
  }

  const items = [...content.cards, ...content.legacy]

  return (
    <section className="mx-auto w-full max-w-5xl" aria-labelledby="catalog-step-title">
      <div className="mb-6 max-w-2xl">
        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-primary">{content.eyebrow}</span>
        <h2 id="catalog-step-title" className="text-2xl font-semibold tracking-tight text-text-main sm:text-3xl">{content.title}</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">{content.description}</p>
      </div>

      <div className="relative mb-5 max-w-xl">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={content.placeholder}
          aria-label={content.placeholder}
          className="h-11 w-full rounded-xl border border-slate-200 bg-surface pl-10 pr-10 text-sm text-text-main shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpar busca"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted transition hover:bg-surface-subtle hover:text-text-main"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(item => (
            <CatalogChoice
              key={item.id}
              {...item}
              iconSize={props.catalogIconSize}
              titleSize={props.catalogFontSize}
              iconBackground={props.customIconBg}
              cardBackground={props.customPillBg}
              cardColor={props.customPillColor}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-surface-subtle px-6 py-12 text-center">
          <Search className="mx-auto h-6 w-6 text-text-muted" />
          <h3 className="mt-3 text-sm font-semibold text-text-main">
            {query ? `Nenhum resultado para “${query}”` : 'Nenhum item disponível'}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
            {query ? 'Tente um termo mais curto ou busque pelo nome do serviço.' : `O catálogo${props.selDept ? ` de ${props.selDept.name}` : ''} ainda não possui itens ativos nesta etapa.`}
          </p>
          {query && (
            <button type="button" onClick={() => setQuery('')} className="mt-4 text-sm font-semibold text-primary hover:underline">
              Limpar busca
            </button>
          )}
        </div>
      )}
    </section>
  )
}

interface CatalogChoiceProps {
  title: string
  description: string
  meta: string
  icon?: string | null
  emoji?: string
  onClick: () => void
  iconSize: number
  titleSize: string
  iconBackground?: string
  cardBackground?: string
  cardColor?: string
}

function CatalogChoice({
  title, description, meta, icon, emoji, onClick, iconSize, titleSize,
  iconBackground, cardBackground, cardColor,
}: CatalogChoiceProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-36 w-full flex-col rounded-2xl border border-slate-200 bg-surface p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={{ backgroundColor: cardBackground || undefined, color: cardColor || undefined }}
    >
      <div className="flex w-full items-start justify-between gap-4">
        {emoji ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-subtle text-xl" aria-hidden="true">{emoji}</span>
        ) : (
          <CatalogIcon icon={icon} name={title} size={Math.min(iconSize, 44)} bg={iconBackground} />
        )}
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div className="mt-4 font-semibold leading-snug text-text-main" style={{ fontSize: titleSize, color: cardColor || undefined }}>{title}</div>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-text-muted" style={{ color: cardColor || undefined }}>{description}</p>
      <div className="mt-auto pt-4 text-xs font-medium text-text-muted" style={{ color: cardColor || undefined }}>{meta}</div>
    </button>
  )
}

function CatalogLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse">
      <div className="h-3 w-20 rounded bg-surface-subtle" />
      <div className="mt-3 h-8 w-72 max-w-full rounded bg-surface-subtle" />
      <div className="mt-3 h-4 w-96 max-w-full rounded bg-surface-subtle" />
      <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-36 rounded-2xl border border-slate-200 bg-surface" />)}
      </div>
    </div>
  )
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function belongsToRequestCategory(item: RequestItemRow, categoryId: string, subcategories: RequestSubcategoryRow[]): boolean {
  if (item.request_category_id) return item.request_category_id === categoryId
  const subcategory = subcategories.find(candidate => candidate.id === item.request_subcategory_id)
  return subcategory?.category_id === categoryId
}
