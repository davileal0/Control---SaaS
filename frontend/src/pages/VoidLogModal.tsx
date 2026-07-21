import { useEffect, useRef, useState, FormEvent } from 'react';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { MovementLog, STATUS_LABEL } from '../types/domain';
import './peripherals-modal.css';
import './audit.css';
import './asset-modal.css';

interface Props {
  log: MovementLog;
  onClose: () => void;
  onConfirmed: () => void;
}

// Modal de anulação de lançamento. Anular é uma remoção LÓGICA — o
// registro permanece no banco, apenas marcado como `isVoided=true`.
// Isso é importante pra auditoria: continua sendo possível ver que o
// erro existiu, quem corrigiu, quando e por quê.
//
// Diferente da edição: aqui o operador não muda nada do conteúdo —
// só registra a anulação com motivo. A trilha imutável de correções
// recebe um item operation=VOID.
export default function VoidLogModal({ log, onClose, onConfirmed }: Props) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    reasonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const motivo = reason.trim();
    if (motivo.length < 5) {
      setError('Motivo da anulação obrigatório (mínimo 5 caracteres).');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.voidMovement(log.id, { reason: motivo });
      toast.success('Lançamento anulado');
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao anular o lançamento.');
      toast.error('Não foi possível anular o lançamento.');
      setSubmitting(false);
    }
  }

  const transitionSummary = log.originStatus
    ? `${STATUS_LABEL[log.originStatus]} → ${STATUS_LABEL[log.destinationStatus]}`
    : `Ingestão → ${STATUS_LABEL[log.destinationStatus]}`;

  return (
    <div
      className="modal-backdrop modal-backdrop--stacked"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="modal movement-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Anular lançamento"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Anulação de lançamento</span>
            <h2>Anular lançamento</h2>
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

        {/* Resumo do lançamento que está sendo anulado */}
        <div className="movement-context">
          <div className="movement-context__asset">
            <span className="movement-context__model">{transitionSummary}</span>
            <code className="movement-context__serial">
              {new Date(log.timestamp).toLocaleString('pt-BR')}
              {log.ticketId && ` · Chamado ${log.ticketId}`}
              {log.endUserName && ` · ${log.endUserName}`}
            </code>
          </div>
        </div>

        <div className="discard-warning" role="alert">
          <strong>Remoção lógica.</strong> O lançamento permanece no banco
          para auditoria, mas é marcado como <em>Anulado</em> — não conta
          mais pra histórico ativo. A trilha imutável de correções registra
          quem anulou, quando e o motivo.
        </div>

        <form onSubmit={handleSubmit} className="asset-form">
          <label className="form-field">
            <span className="form-label">Motivo da anulação</span>
            <textarea
              ref={reasonRef}
              className="field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex.: lançamento duplicado / ativo errado por engano"
              rows={3}
              required
            />
          </label>

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
            <button type="submit" className="btn warning" disabled={submitting}>
              {submitting ? 'Anulando…' : 'Confirmar anulação'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
