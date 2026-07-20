import { useState, useEffect } from 'react';

interface FormFieldOption {
  label: string;
  value: string;
}

interface FormFieldDef {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: FormFieldOption[];
}

interface FormSchema {
  fields: FormFieldDef[];
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  number: 'Número',
  select: 'Lista de opções',
  checkbox: 'Sim/Não',
};

export function FormBuilder({ value, onChange, label }: { value: string; onChange: (val: string) => void; label: string }) {
  const [schema, setSchema] = useState<FormSchema>({ fields: [] });

  const [newId, setNewId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('text');
  const [newRequired, setNewRequired] = useState(false);

  useEffect(() => {
    try {
      const parsed = JSON.parse(value || '{}');
      setSchema({
        fields: Array.isArray(parsed.fields) ? parsed.fields : [],
      });
    } catch (e) {
      // invalid json
    }
  }, [value]);

  const pushUpdate = (newSchema: FormSchema) => {
    setSchema(newSchema);
    onChange(JSON.stringify(newSchema));
  };

  const addField = () => {
    if (!newId.trim() || !newLabel.trim()) return;
    if (schema.fields.some(f => f.id === newId.trim())) return;
    
    const newField: FormFieldDef = {
      id: newId.trim(),
      label: newLabel.trim(),
      type: newType,
      required: newRequired,
    };
    if (newType === 'select') newField.options = [];
    
    pushUpdate({ fields: [...schema.fields, newField] });
    setNewId('');
    setNewLabel('');
    setNewType('text');
    setNewRequired(false);
  };

  const removeField = (idx: number) => {
    const nextF = [...schema.fields];
    nextF.splice(idx, 1);
    pushUpdate({ fields: nextF });
  };

  const addOption = (fieldIdx: number) => {
    const optLabel = prompt('Nome da opção (Label):');
    if (!optLabel) return;
    const optValue = prompt('Valor da opção (Value):');
    if (!optValue) return;

    const nextF = [...schema.fields];
    if (!nextF[fieldIdx].options) nextF[fieldIdx].options = [];
    nextF[fieldIdx].options!.push({ label: optLabel, value: optValue });
    pushUpdate({ fields: nextF });
  };

  const removeOption = (fieldIdx: number, optIdx: number) => {
    const nextF = [...schema.fields];
    nextF[fieldIdx].options!.splice(optIdx, 1);
    pushUpdate({ fields: nextF });
  };

  return (
    <div className="mt-4 mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-bold text-slate-800">{label}</h3>
      <p className="mb-4 mt-1 text-xs leading-5 text-slate-500">
        Campos extras que aparecem só neste tipo de caso, além dos campos padrão (descrição, prioridade etc.).
        Se não adicionar nenhum campo aqui, o formulário padrão é usado normalmente — este passo é opcional.
      </p>

      <div className="mb-6 space-y-3">
        {schema.fields.map((f, idx) => (
          <div key={f.id} className="rounded-xl border bg-white p-3 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{f.label}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{FIELD_TYPE_LABELS[f.type] ?? f.type}</span>
                {f.required && <span className="rounded bg-red-100 text-red-700 px-2 py-0.5 text-xs">Obrigatório</span>}
              </div>
              <button type="button" onClick={() => removeField(idx)} title="Remover este campo" className="text-red-500 hover:text-red-700 text-sm font-bold">&times;</button>
            </div>

            {f.type === 'select' && (
              <div className="mt-2 border-t pt-2 border-slate-100">
                <p className="text-xs text-slate-500 mb-1">Opções que a pessoa poderá escolher:</p>
                <div className="flex flex-wrap gap-2">
                  {(f.options || []).map((opt, oIdx) => (
                    <span key={oIdx} className="inline-flex items-center gap-1 rounded bg-slate-100 border px-2 py-1 text-xs">
                      {opt.label}
                      <button type="button" onClick={() => removeOption(idx, oIdx)} className="text-red-500 ml-1">&times;</button>
                    </span>
                  ))}
                  <button type="button" onClick={() => addOption(idx)} className="text-xs text-blue-600 hover:underline">+ Adicionar opção</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {schema.fields.length === 0 && <span className="text-xs text-slate-400 block">Nenhum campo extra configurado — o tipo de caso usa só o formulário padrão.</span>}
      </div>

      <div className="border-t pt-4 border-slate-200">
        <h4 className="text-xs font-semibold text-slate-600">Adicionar um campo novo</h4>
        <p className="mb-2 mt-0.5 text-[11px] leading-4 text-slate-400">
          Preencha como o campo deve se chamar para quem preenche o formulário, e um identificador interno curto (sem espaços) que o sistema usa para guardar essa informação.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-xs font-bold flex-1 min-w-32">Nome do campo (o que a pessoa vê)
            <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" placeholder="ex: Área solicitante" />
          </label>
          <label className="block text-xs font-bold w-36">Identificador interno
            <input type="text" value={newId} onChange={e => setNewId(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-sm" placeholder="ex: area_solicitante" />
          </label>
          <label className="block text-xs font-bold w-36">Tipo de resposta
            <select value={newType} onChange={e => setNewType(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm bg-white">
              <option value="text">Texto curto</option>
              <option value="textarea">Texto longo</option>
              <option value="number">Número</option>
              <option value="select">Lista de opções</option>
              <option value="checkbox">Sim/Não</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs font-bold mb-2" title="Se marcado, quem preencher o formulário é obrigado a informar este campo">
            <input type="checkbox" checked={newRequired} onChange={e => setNewRequired(e.target.checked)} />
            Obrigatório
          </label>
          <button type="button" onClick={addField} className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700 mb-0.5">Adicionar campo</button>
        </div>
      </div>
    </div>
  );
}
