import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { mockApiEndpoints } from '../../services/appMocks'
import { buildCurlExample, getApiModuleLabel } from '../../lib/developer-experience'

const methodStyle: Record<string, string> = {
  GET: 'border-sky-200 bg-sky-50 text-sky-700',
  POST: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PATCH: 'border-amber-200 bg-amber-50 text-amber-700',
  DELETE: 'border-red-200 bg-red-50 text-red-700',
}

export default function ApiDocs() {
  const [selectedEndpoint, setSelectedEndpoint] = useState(mockApiEndpoints[0].id)
  const [activeModule, setActiveModule] = useState('all')
  const [copied, setCopied] = useState(false)
  const endpoint = mockApiEndpoints.find(item => item.id === selectedEndpoint) ?? mockApiEndpoints[0]
  const modules = ['all', ...Array.from(new Set(mockApiEndpoints.map(item => item.module)))]
  const filtered = activeModule === 'all'
    ? mockApiEndpoints
    : mockApiEndpoints.filter(item => item.module === activeModule)
  const curlExample = buildCurlExample(endpoint)

  const selectModule = (module: string) => {
    setActiveModule(module)
    const first = module === 'all'
      ? mockApiEndpoints[0]
      : mockApiEndpoints.find(item => item.module === module)
    if (first) setSelectedEndpoint(first.id)
  }

  const copyCurl = async () => {
    await navigator.clipboard.writeText(curlExample)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold text-emerald-700">Central de integração</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">API e webhooks</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
          Consulte endpoints, escopos e exemplos prontos para conectar o ServiceFY.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Metadata label="Base URL" value="https://api.servicefy.com" mono />
          <div>
            <p className="text-xs font-semibold text-slate-500">Autenticação</p>
            <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-800">
              <KeyRound className="h-4 w-4 text-amber-600" /> Bearer token
            </p>
          </div>
          <Metadata label="Contrato atual" value="REST · JSON · v1" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)]">
        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-3">
            <p className="mb-2 px-1 text-xs font-semibold text-slate-500">Filtrar por domínio</p>
            <div className="flex flex-wrap gap-1.5">
              {modules.map(module => (
                <button
                  key={module}
                  onClick={() => selectModule(module)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    activeModule === module ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {module === 'all' ? 'Todos' : getApiModuleLabel(module)}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedEndpoint(item.id)}
                className={`flex w-full items-start gap-3 border-l-2 px-4 py-3.5 text-left transition-colors ${
                  selectedEndpoint === item.id
                    ? 'border-l-emerald-500 bg-emerald-50/60'
                    : 'border-l-transparent hover:bg-slate-50'
                }`}
              >
                <MethodBadge method={item.method} />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-semibold text-slate-700">{item.path}</span>
                  <span className="mt-1 block text-xs leading-4 text-slate-500">{item.summary}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <MethodBadge method={endpoint.method} />
              <code className="break-all text-sm font-semibold text-slate-700">{endpoint.path}</code>
              {endpoint.requiresAuth && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                  <KeyRound className="h-3.5 w-3.5" /> Token obrigatório
                </span>
              )}
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">{endpoint.summary}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{endpoint.description}</p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-slate-500">Escopos necessários</h3>
            <div className="flex flex-wrap gap-1.5">
              {endpoint.authScopes.map(scope => (
                <code key={scope} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">{scope}</code>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-slate-500">Exemplo com cURL</h3>
              <button
                onClick={() => void copyCurl()}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                aria-label="Copiar exemplo cURL"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">{curlExample}</pre>
          </div>

          {endpoint.requestBody && <JsonBlock title="Corpo da requisição" value={endpoint.requestBody} />}
          <JsonBlock title="Resposta esperada · 200 OK" value={endpoint.responseExample} />
        </section>
      </div>
    </div>
  )
}

function Metadata({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 break-all text-sm font-semibold text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={`mt-0.5 w-12 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-[10px] font-bold ${methodStyle[method] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}>
      {method}
    </span>
  )
}

function JsonBlock({ title, value }: { title: string; value: object }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-slate-500">{title}</h3>
      <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}
