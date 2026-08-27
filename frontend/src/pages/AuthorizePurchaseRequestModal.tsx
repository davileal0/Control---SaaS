import { useEffect, useRef, useState, FormEvent } from 'react';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { PurchaseRequestTargetKind } from '../types/domain';
import './asset-modal.css';

interface Props {
  // Pré-preenchimento opcional (vem do PeripheralsModal "Autorizar pra Mouse")
  presetKind?: PurchaseRequestTargetKind;
  presetValue?: string;
  onClose: () => void;
  onCreated: () => void;
}

// ┌─────────────────────────────────────────────────────────────────┐
// │ Modal: Autorizar nova SC                                        │
// ├─────────────────────────────────────────────────────────────────┤
// │ Quem usa: Líder N1 + Diretor TI                                 │
// │                                                                 │
// │ Cenários:                                                       │
// │   1. Aberto via "+ Nova SC" na página Solicitações              │
// │      → escolhe targetKind + targetValue manualmente             │
// │   2. Aberto via botão "Autorizar SC" no alerta de periférico    │
// │      → pré-preenchido (kind=PERIPHERAL_MODEL, value=model)      │
// └─────────────────────────────────────────────────────────────────┘
//
// Opções do targetKind:
//   - CATEGORY pra Notebook/Celular/AllInOne (a categoria taxonômica)
//   - PERIPHERAL_MODEL pra Mouse/Teclado/Headset (literal do model
//     cadastrado nos periféricos)
export default function AuthorizePurchaseRequestModal({
  presetKind,
  presetValue,
  onClose,
  onCreated,
}: Props) {
  const toast = useToast();
  const [targetKind, setTargetKind] = useState<PurchaseRequestTargetKind>(
    presetKind ?? 'CATEGORY',
  );
  const [targetValue, setTargetValue] = useState(presetValue ?? '');
  // Modelo específico do equipamento (só pra CATEGORY). Ex: "Dell Latitude 3420"
  const [equipmentModel, setEquipmentModel] = useState('');
  // Quantidade: string aqui (não number) porque input numérico vazio
  // vira NaN — string controla melhor o estado vazio inicial.
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const isPreset = !!presetValue;

  useEffect(() => {
    if (!isPreset) firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting, isPreset]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = targetValue.trim();
    if (value.length < 1) {
      setError('Informe o alvo da compra.');
      return;
    }
    // Validação numérica explícita — input pode estar vazio ou ter
    // texto inválido mesmo com type=number (algumas combinações
    // de browser/teclado permitem).
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setError('Quantidade obrigatória. Use número inteiro maior que zero.');
      return;
    }
    if (qty > 10000) {
      setError('Quantidade excede o limite (10.000 unidades).');
      return;
    }
    // Modelo obrigatório pra equipamento (CATEGORY). É herdado pelos
    // ativos no recebimento, então precisa estar definido desde já.
    const model = equipmentModel.trim();
    if (targetKind === 'CATEGORY' && model.length < 1) {
      setError('Informe o modelo do equipamento (ex.: "Dell Latitude 3420").');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.authorizePurchaseRequest({
        targetKind,
        targetValue: value,
        quantity: qty,
        equipmentModel: targetKind === 'CATEGORY' ? model : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success('SC autorizada — aguardando abertura');
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao autorizar SC.';
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop modal-backdrop--stacked"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="modal movement-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Autorizar Solicitação de Compra"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Autorização hierárquica</span>
            <h2>Autorizar nova SC</h2>
          </div>
          <button
            className="btn"
            onClick={onClose}
            type="button"
            disabled={submitting}
          >
            Fechar
          </button>
        </header>

        <form onSubmit={handleSubmit} className="asset-form">
          {isPreset ? (
            // Pré-preenchido pelo PeripheralsModal — alvo travado, só nota livre.
            <div className="movement-context">
              <div className="movement-context__asset">
                <span className="movement-context__model">
                  {targetKind === 'CATEGORY' ? 'Categoria' : 'Modelo'}
                </span>
                <code className="movement-context__serial">{targetValue}</code>
              </div>
            </div>
          ) : (
            <>
              <label className="form-field">
                <span className="form-label">Tipo de alvo</span>
                <select
                  ref={firstFieldRef}
                  className="field"
                  value={targetKind}
                  onChange={(e) =>
                    setTargetKind(e.target.value as PurchaseRequestTargetKind)
                  }
                >
                  <option value="CATEGORY">
                    Categoria (Notebook / Celular / All-in-One)
                  </option>
                  <option value="PERIPHERAL_MODEL">
                    Periférico (Mouse / Teclado / Headset / etc.)
                  </option>
                </select>
              </label>

              <label className="form-field">
                <span className="form-label">
                  {targetKind === 'CATEGORY'
                    ? 'Categoria alvo'
                    : 'Tipo do periférico'}
                </span>
                {targetKind === 'CATEGORY' ? (
                  <select
                    className="field"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    required
                  >
                    <option value="">Selecione…</option>
                    <option value="Notebook">Notebook</option>
                    <option value="Celular">Celular</option>
                    <option value="AllInOne">All-in-One</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    className="field"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    placeholder="ex.: Mouse, Teclado, Headset"
                    required
                  />
                )}
              </label>
            </>
          )}

          <label className="form-field">
            <span className="form-label">Quantidade de unidades</span>
            <input
              type="number"
              className="field"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="ex.: 50"
              min={1}
              max={10000}
              step={1}
              required
            />
          </label>

          {/* Modelo do equipamento — só pra CATEGORY (equipamento).
              Periférico não tem modelo específico (targetValue já é o
              modelo). Herdado pelos ativos no recebimento. */}
          {targetKind === 'CATEGORY' && (
            <label className="form-field">
              <span className="form-label">Modelo do equipamento</span>
              <input
                type="text"
                className="field"
                value={equipmentModel}
                onChange={(e) => setEquipmentModel(e.target.value)}
                placeholder='ex.: Dell Latitude 3420'
                required
              />
              <span className="form-hint">
                Será herdado por todos os equipamentos no recebimento.
              </span>
            </label>
          )}

          <label className="form-field">
            <span className="form-label">Observações (opcional)</span>
            <textarea
              className="field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex.: Justificativa adicional, fornecedor preferido, prazo desejado"
              rows={3}
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <footer className="form-footer">
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? 'Autorizando…' : 'Autorizar SC'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
