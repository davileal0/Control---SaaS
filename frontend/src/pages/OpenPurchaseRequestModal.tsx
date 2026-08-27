import { useEffect, useRef, useState, FormEvent } from 'react';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { PurchaseRequest } from '../types/domain';
import './asset-modal.css';

interface Props {
  request: PurchaseRequest;
  onClose: () => void;
  onOpened: () => void;
}

// Modal usado pelo Heryck (Operador N1) — ou Líder/Diretor cobrindo
// ausência — pra registrar o número emitido pelo sistema da Unifique.
// Transição AGUARDANDO_ABERTURA → ABERTA.
//
// Formato do número da SC: campo livre (Unifique usa coisas como
// "0092", "90344", etc — sem padrão único de comprimento).
export default function OpenPurchaseRequestModal({
  request,
  onClose,
  onOpened,
}: Props) {
  const toast = useToast();
  const [scNumber, setScNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const num = scNumber.trim();
    if (num.length < 1) {
      setError('Informe o número da SC.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.openPurchaseRequest(request.id, {
        scNumber: num,
        notes: notes.trim() || undefined,
      });
      toast.success(`SC ${num} marcada como aberta`);
      onOpened();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao abrir SC.';
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
        aria-label="Marcar SC como aberta"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Registro de abertura</span>
            <h2>Marcar SC como aberta</h2>
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

        <div className="movement-context">
          <div className="movement-context__asset">
            <span className="movement-context__model">
              {request.targetKind === 'CATEGORY' ? 'Categoria' : 'Modelo'}
            </span>
            <code className="movement-context__serial">
              {request.targetValue} · {request.quantity}{' '}
              {request.quantity === 1 ? 'unidade' : 'unidades'}
            </code>
          </div>
          <div className="movement-context__transition">
            <span className="pill">Aguardando</span>
            <span className="movement-context__arrow">→</span>
            <span className="pill pill--Disponivel">Em compra</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="asset-form">
          <label className="form-field">
            <span className="form-label">Número da SC</span>
            <input
              ref={firstFieldRef}
              type="text"
              className="field"
              value={scNumber}
              onChange={(e) => setScNumber(e.target.value)}
              placeholder="ex.: 0092, 90344"
              required
            />
          </label>

          <label className="form-field">
            <span className="form-label">Observações (opcional)</span>
            <textarea
              className="field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex.: Quantidade exata pedida, prazo combinado, fornecedor"
              rows={3}
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <footer className="form-footer">
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? 'Registrando…' : 'Marcar como aberta'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
