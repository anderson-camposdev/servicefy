import { useState, useEffect } from 'react';

interface Transition {
  from: string;
  to: string;
}

interface WorkflowConfig {
  states: string[];
  transitions: Transition[];
}

export function WorkflowBuilder({ value, onChange, label }: { value: string; onChange: (val: string) => void; label: string }) {
  const [config, setConfig] = useState<WorkflowConfig>({ states: [], transitions: [] });
  const [newState, setNewState] = useState('');
  const [newTransFrom, setNewTransFrom] = useState('');
  const [newTransTo, setNewTransTo] = useState('');

  useEffect(() => {
    try {
      const parsed = JSON.parse(value || '{}');
      setConfig({
        states: Array.isArray(parsed.states) ? parsed.states : [],
        transitions: Array.isArray(parsed.transitions) ? parsed.transitions : [],
      });
    } catch (e) {
      // invalid json
    }
  }, [value]);

  const pushUpdate = (newCfg: WorkflowConfig) => {
    setConfig(newCfg);
    onChange(JSON.stringify(newCfg));
  };

  const addState = () => {
    if (!newState.trim() || config.states.includes(newState.trim())) return;
    pushUpdate({ ...config, states: [...config.states, newState.trim()] });
    setNewState('');
  };

  const removeState = (st: string) => {
    const nextStates = config.states.filter(s => s !== st);
    const nextTransitions = config.transitions.filter(t => t.from !== st && t.to !== st);
    pushUpdate({ states: nextStates, transitions: nextTransitions });
  };

  const addTransition = () => {
    if (!newTransFrom || !newTransTo || newTransFrom === newTransTo) return;
    if (config.transitions.some(t => t.from === newTransFrom && t.to === newTransTo)) return;
    pushUpdate({ ...config, transitions: [...config.transitions, { from: newTransFrom, to: newTransTo }] });
  };

  const removeTransition = (idx: number) => {
    const nextT = [...config.transitions];
    nextT.splice(idx, 1);
    pushUpdate({ ...config, transitions: nextT });
  };

  return (
    <div className="mt-4 mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="mb-4 text-sm font-bold text-slate-800">{label}</h3>
      
      <div className="mb-6">
        <h4 className="mb-2 text-xs font-semibold text-slate-600">Estados Permitidos</h4>
        <div className="flex flex-wrap gap-2 mb-3">
          {config.states.map(s => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
              {s}
              <button type="button" onClick={() => removeState(s)} className="text-blue-500 hover:text-blue-900">&times;</button>
            </span>
          ))}
          {config.states.length === 0 && <span className="text-xs text-slate-400">Nenhum estado configurado.</span>}
        </div>
        <div className="flex gap-2">
          <input type="text" value={newState} onChange={e => setNewState(e.target.value)} placeholder="Ex: Em Análise" className="w-48 rounded-lg border px-3 py-1.5 text-sm" />
          <button type="button" onClick={addState} className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-300">Adicionar</button>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold text-slate-600">Regras de Transição (De &rarr; Para)</h4>
        <div className="mb-3 space-y-2">
          {config.transitions.map((t, idx) => (
            <div key={idx} className="flex items-center gap-3 text-sm">
              <span className="rounded bg-white px-2 py-1 border shadow-sm w-32 text-center truncate">{t.from}</span>
              <span className="text-slate-400">&rarr;</span>
              <span className="rounded bg-white px-2 py-1 border shadow-sm w-32 text-center truncate">{t.to}</span>
              <button type="button" onClick={() => removeTransition(idx)} className="text-red-500 hover:text-red-700 font-bold ml-2">&times;</button>
            </div>
          ))}
          {config.transitions.length === 0 && <span className="text-xs text-slate-400">Nenhuma regra de transição configurada.</span>}
        </div>
        <div className="flex items-center gap-2 mt-4 border-t pt-3 border-slate-200">
          <select value={newTransFrom} onChange={e => setNewTransFrom(e.target.value)} className="w-32 rounded-lg border px-2 py-1.5 text-sm bg-white">
            <option value="">Origem...</option>
            {config.states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-slate-400">&rarr;</span>
          <select value={newTransTo} onChange={e => setNewTransTo(e.target.value)} className="w-32 rounded-lg border px-2 py-1.5 text-sm bg-white">
            <option value="">Destino...</option>
            {config.states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" onClick={addTransition} className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-300">Adicionar Regra</button>
        </div>
      </div>
    </div>
  );
}
