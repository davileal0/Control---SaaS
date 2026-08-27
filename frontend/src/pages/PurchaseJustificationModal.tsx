import { useEffect, useState, FormEvent } from 'react';
import {
  downloadPurchaseJustification,
  PurchaseJustificationFilters,
} from '../lib/api';
import { Role } from '../types/domain';
import './peripherals-modal.css';
import './asset-modal.css';

interface Props {
  role: Role;
  onClose: () => void;
}

type Category = PurchaseJustificationFilters['category'];

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'Notebook', label: 'Notebooks' },
  { value: 'Desktop', label: 'Desktops' },
  { value: 'Celular', label: 'Celulares' },
  { value: 'AllInOne', label: 'All-in-Ones' },
  { value: 'Periferico', label: 'Periféricos' },
];

type Preset = '30d' | '90d' | '6m' | '12m' | 'ytd' | 'custom';
const PRESETS: { value: Preset; label: string }[] = [
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: '12m', label: 'Últimos 12 meses' },
  { value: 'ytd', label: 'Ano corrente' },
  { value: 'custom', label: 'Período personalizado' },
];

// Calcula intervalo (start, end) a partir do preset selecionado.
// Datas no formato ISO 'YYYY-MM-DD' (compatível com input type=date).
function rangeFromPreset(preset: Preset): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today);
  switch (preset) {
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '6m':
      start.setMonth(start.getMonth() - 6);
      break;
    case '12m':
      start.setMonth(start.getMonth() - 12);
      break;
    case 'ytd':
      start.setMonth(0, 1);
      break;
    case 'custom':
      // Default: últimos 6 meses como ponto de partida pra edição manual
      start.setMonth(start.getMonth() - 6);
      break;
  }
  return { start: start.toISOString().slice(0, 10), end };
}

export default function PurchaseJustificationModal({ role, onClose }: Props) {
  const [category, setCategory] = useState<Category>('Notebook');
  const [preset, setPreset] = useState<Preset>('6m');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');
  // Quantidade a solicitar — o gestor (Líder/Coordenador) julga quantos
  // repor. String no estado pra controlar o campo vazio inicial.
  const [quantity, setQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOperator = role === 'OPERADOR_N1';

  // Aplica preset → atualiza as datas
  useEffect(() => {
    const r = rangeFromPreset(preset);
    setPeriodStart(r.start);
    setPeriodEnd(r.end);
  }, [preset]);

  // Esc fecha (a menos que esteja gerando)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!periodStart || !periodEnd) {
      setError('Defina o período inicial e final.');
      return;
    }
    if (periodStart > periodEnd) {
      setError('A data inicial deve ser anterior à data final.');
      return;
    }
    // Quantidade obrigatória, inteiro entre 1 e 300
    const qty = Number(quantity);
    if (!quantity.trim() || !Number.isInteger(qty)) {
      setError('Informe a quantidade a solicitar (número inteiro).');
      return;
    }
    if (qty < 1 || qty > 300) {
      setError('A quantidade deve estar entre 1 e 300.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await downloadPurchaseJustification(
        { category, periodStart, periodEnd, quantity: qty },
        format,
      );
      // Pequeno delay pra dar tempo do download disparar antes de fechar
      setTimeout(() => onClose(), 300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar relatório.');
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
        aria-label="Gerar relatório de justificativa de compra"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Geração de relatório</span>
            <h2>Justificativa de Compra</h2>
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

        {isOperator && (
          <div className="report-note" role="note">
            <strong>Atenção.</strong> A geração deste relatório é normalmente
            operada pelo Líder N1 ou Coordenador de TI, que apresenta o
            documento à diretoria. Você tem acesso pra fins de teste e
            manutenção da plataforma.
          </div>
        )}

        <form onSubmit={handleSubmit} className="asset-form">
          <fieldset className="role-radio-group">
            <legend className="form-label">Categoria de equipamento</legend>
            <div className="report-pills">
              {CATEGORIES.map((c) => (
                <label key={c.value} className={`report-pill ${category === c.value ? 'report-pill--active' : ''}`}>
                  <input
                    type="radio"
                    name="category"
                    value={c.value}
                    checked={category === c.value}
                    onChange={() => setCategory(c.value)}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="role-radio-group">
            <legend className="form-label">Quantidade a solicitar</legend>
            <label className="form-field">
              <input
                type="number"
                className="field"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="ex.: 50"
                min={1}
                max={300}
                step={1}
                disabled={submitting}
              />
              <span className="form-label__hint">
                Quantos equipamentos a adquirir (1 a 300). O gestor define
                considerando o prazo de reposição (30 a 40 dias).
              </span>
            </label>
          </fieldset>

          <fieldset className="role-radio-group">
            <legend className="form-label">Período</legend>
            <div className="report-pills">
              {PRESETS.map((p) => (
                <label key={p.value} className={`report-pill ${preset === p.value ? 'report-pill--active' : ''}`}>
                  <input
                    type="radio"
                    name="preset"
                    value={p.value}
                    checked={preset === p.value}
                    onChange={() => setPreset(p.value)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>

            <div className="form-row" style={{ marginTop: 12 }}>
              <label className="form-field">
                <span className="form-label">
                  Início
                  {preset !== 'custom' && (
                    <span className="form-label__hint">(do preset)</span>
                  )}
                </span>
                <input
                  type="date"
                  className="field"
                  value={periodStart}
                  onChange={(e) => {
                    setPreset('custom');
                    setPeriodStart(e.target.value);
                  }}
                  disabled={submitting}
                />
              </label>
              <label className="form-field">
                <span className="form-label">
                  Fim
                  {preset !== 'custom' && (
                    <span className="form-label__hint">(do preset)</span>
                  )}
                </span>
                <input
                  type="date"
                  className="field"
                  value={periodEnd}
                  onChange={(e) => {
                    setPreset('custom');
                    setPeriodEnd(e.target.value);
                  }}
                  disabled={submitting}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="role-radio-group">
            <legend className="form-label">Formato de saída</legend>
            <div className="report-pills">
              <label className={`report-pill ${format === 'pdf' ? 'report-pill--active' : ''}`}>
                <input
                  type="radio"
                  name="format"
                  value="pdf"
                  checked={format === 'pdf'}
                  onChange={() => setFormat('pdf')}
                />
                <span>PDF (apresentação)</span>
              </label>
              <label className={`report-pill ${format === 'xlsx' ? 'report-pill--active' : ''}`}>
                <input
                  type="radio"
                  name="format"
                  value="xlsx"
                  checked={format === 'xlsx'}
                  onChange={() => setFormat('xlsx')}
                />
                <span>Excel (análise/cruzamento)</span>
              </label>
            </div>
          </fieldset>

          {error && <p className="form-error">{error}</p>}

          <footer className="form-footer">
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button type="submit" className="btn accent" disabled={submitting}>
              {submitting ? 'Gerando…' : 'Gerar e baixar'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
