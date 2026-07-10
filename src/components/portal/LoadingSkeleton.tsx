export function LoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Carregando painel"
      className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
            <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-300" />
            <div className="h-4 w-80 max-w-[70vw] animate-pulse rounded-full bg-slate-200" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded-xl bg-slate-200" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map(card => (
            <div key={card} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
                <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-200" />
              </div>
              <div className="mt-5 h-8 w-20 animate-pulse rounded-lg bg-slate-300" />
              <div className="mt-3 h-3 w-28 animate-pulse rounded-full bg-slate-200" />
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="h-5 w-40 animate-pulse rounded-lg bg-slate-300" />
              <div className="h-8 w-24 animate-pulse rounded-lg bg-slate-200" />
            </div>
            <div className="mt-5 space-y-4">
              {[1, 2, 3, 4, 5].map(row => (
                <div key={row} className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-slate-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-3/4 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-slate-100" />
                  </div>
                  <div className="h-6 w-16 animate-pulse rounded-full bg-slate-200" />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="h-5 w-36 animate-pulse rounded-lg bg-slate-300" />
            <div className="mt-5 flex h-40 items-end gap-3">
              {[48, 72, 56, 88, 64, 78].map((height, index) => (
                <div
                  key={index}
                  style={{ height: `${height}%` }}
                  className="flex-1 animate-pulse rounded-t-lg bg-slate-200"
                />
              ))}
            </div>
            <div className="mt-4 h-3 w-48 animate-pulse rounded-full bg-slate-100" />
          </section>
        </div>
      </div>
    </div>
  )
}
