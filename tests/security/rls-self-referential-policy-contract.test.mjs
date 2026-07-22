import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'

// Detector genérico para a classe de bug das migrations 161/162/163: uma
// função usada como USING/WITH CHECK de uma policy de RLS que resolve a
// visibilidade fazendo uma sub-consulta *pela própria tabela da policy*
// filtrando por `id`. Essa sub-consulta nunca enxerga a linha que o
// comando SQL atual acabou de inserir (regra de MVCC do Postgres — um
// comando não vê as próprias inserções via uma nova varredura), então
// qualquer `INSERT ... RETURNING` na tabela falha com "new row violates
// row-level security policy", mesmo quando a lógica de autorização em si
// está correta.
//
// Encontrado 3 vezes nesta sessão (tickets, knowledge_articles, cases) —
// sempre no mesmo formato: `CREATE POLICY ... USING (func(id))` onde
// `func(uuid)` faz `SELECT ... FROM public.<mesma_tabela> WHERE x.id =
// p_..._id`. A correção sempre foi a mesma: uma variante que recebe as
// colunas da própria linha em vez de re-consultar por chave primária
// (ex.: can_read_ticket_row, can_read_knowledge_article_row,
// can_read_case_row).
//
// Este teste varre TODAS as migrations (estado final, respeitando
// DROP POLICY / CREATE POLICY em ordem cronológica) e falha se qualquer
// policy viva ainda usar uma função desse formato contra a própria
// tabela.

export function findFinalFunctionBodies(sql) {
  const bodies = new Map()
  const FUNC_RE = /CREATE OR REPLACE FUNCTION public\.(\w+)\s*\(([^)]*)\)[\s\S]*?\bAS\s+(\$\w*\$)([\s\S]*?)\3/g
  let m
  while ((m = FUNC_RE.exec(sql))) {
    const [, name, args, , body] = m
    bodies.set(name, { args: args.trim(), body })
  }
  return bodies
}

export function findSelfReferentialFunctions(sql) {
  const bodies = findFinalFunctionBodies(sql)
  const selfReferential = new Map() // nome da função -> tabela que ela auto-consulta
  for (const [name, { args, body }] of bodies) {
    // Assinatura das funções problemáticas: um único parâmetro uuid
    // nomeado p_..._id (ex.: p_ticket_id, p_article_id, p_case_id).
    if (!/^p_\w*_id\s+uuid$/.test(args)) continue
    const selfQuery = body.match(/FROM\s+public\.(\w+)\s+\w+[\s\S]{0,400}?\w+\.id\s*=\s*p_\w+/)
    if (selfQuery) selfReferential.set(name, selfQuery[1])
  }
  return selfReferential
}

export function findFinalPolicies(sql) {
  const policies = new Map() // "table::policyName" -> statement completo
  const STMT_RE = /(CREATE POLICY\s+"?(\w+)"?\s+ON\s+public\.(\w+)[\s\S]*?;)|(DROP POLICY(?:\s+IF EXISTS)?\s+"?(\w+)"?\s+ON\s+public\.(\w+)\s*;)/g
  let m
  while ((m = STMT_RE.exec(sql))) {
    if (m[1]) {
      const [, stmt, name, table] = m
      policies.set(`${table}::${name}`, stmt)
    } else {
      const [, , , , , name, table] = m
      policies.delete(`${table}::${name}`)
    }
  }
  return policies
}

export function findSelfReferentialRlsPolicies(sql) {
  const selfReferential = findSelfReferentialFunctions(sql)
  const policies = findFinalPolicies(sql)
  const violations = []
  for (const [key, stmt] of policies) {
    const [table, policyName] = key.split('::')
    for (const [fnName, selfTable] of selfReferential) {
      if (selfTable !== table) continue
      const callRe = new RegExp(`\\b${fnName}\\s*\\(\\s*(?:\\w+\\.)?id\\s*\\)`)
      if (callRe.test(stmt)) {
        violations.push({ table, policyName, fnName })
      }
    }
  }
  return violations
}

// ── Autoteste do detector (fixtures sintéticas, não dependem do estado
//    real das migrations — garantem que a lógica acima está correta) ──

test('detector: acusa uma policy que usa func(id) contra a própria tabela que ela consulta', () => {
  const fixture = `
    CREATE OR REPLACE FUNCTION public.can_read_widget(p_widget_id uuid)
      RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS (SELECT 1 FROM public.widgets w WHERE w.id = p_widget_id AND w.owner = 1);
    $$;
    CREATE POLICY widgets_read ON public.widgets
      FOR SELECT TO authenticated USING (can_read_widget(id));
  `
  const violations = findSelfReferentialRlsPolicies(fixture)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].table, 'widgets')
  assert.equal(violations[0].fnName, 'can_read_widget')
})

test('detector: não acusa uma função que recebe as colunas da própria linha (o padrão corrigido)', () => {
  const fixture = `
    CREATE OR REPLACE FUNCTION public.can_read_widget_row(p_owner uuid)
      RETURNS boolean LANGUAGE sql AS $$
      SELECT p_owner = 1;
    $$;
    CREATE POLICY widgets_read ON public.widgets
      FOR SELECT TO authenticated USING (can_read_widget_row(owner));
  `
  assert.deepEqual(findSelfReferentialRlsPolicies(fixture), [])
})

test('detector: não acusa uso legítimo de func(id) contra uma tabela DIFERENTE (sem risco de MVCC)', () => {
  const fixture = `
    CREATE OR REPLACE FUNCTION public.can_read_widget(p_widget_id uuid)
      RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS (SELECT 1 FROM public.widgets w WHERE w.id = p_widget_id);
    $$;
    CREATE POLICY grants_read ON public.widget_grants
      FOR SELECT TO authenticated USING (can_read_widget(widget_id));
  `
  assert.deepEqual(findSelfReferentialRlsPolicies(fixture), [])
})

test('detector: respeita DROP POLICY seguido de CREATE POLICY (estado final vence, não o histórico)', () => {
  const fixture = `
    CREATE OR REPLACE FUNCTION public.can_read_widget(p_widget_id uuid)
      RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS (SELECT 1 FROM public.widgets w WHERE w.id = p_widget_id);
    $$;
    CREATE OR REPLACE FUNCTION public.can_read_widget_row(p_owner uuid)
      RETURNS boolean LANGUAGE sql AS $$
      SELECT p_owner = 1;
    $$;
    CREATE POLICY widgets_read ON public.widgets
      FOR SELECT TO authenticated USING (can_read_widget(id));
    DROP POLICY IF EXISTS widgets_read ON public.widgets;
    CREATE POLICY widgets_read ON public.widgets
      FOR SELECT TO authenticated USING (can_read_widget_row(owner));
  `
  assert.deepEqual(findSelfReferentialRlsPolicies(fixture), [])
})

// ── Varredura real: todas as migrations aplicadas, estado final ──

test('nenhuma policy de RLS viva usa uma função que se auto-consulta pela própria linha (quebraria INSERT...RETURNING)', () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url)
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  assert.ok(files.length > 0, 'deveria encontrar arquivos de migration')
  const allSql = files.map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n')

  const violations = findSelfReferentialRlsPolicies(allSql)
  assert.deepEqual(
    violations,
    [],
    violations.length
      ? 'Policies com o padrão de auto-consulta que já quebrou tickets, knowledge_articles e cases:\n' +
        violations.map(v => `  - ${v.table}.${v.policyName} usa ${v.fnName}(id)`).join('\n')
      : undefined,
  )
})

test('Contrato de auto-referência em policy de RLS participa da suíte de segurança padrão', () => {
  const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  assert.match(packageJson, /tests\/security\/rls-self-referential-policy-contract\.test\.mjs/)
})
