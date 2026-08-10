import { useEffect, useRef, useState, FormEvent } from 'react';
import { api, AuditResult } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { STATUS_LABEL } from '../types/domain';
import AssetLocation from '../components/AssetLocation';
import './peripherals-modal.css';
import './audit.css'; // pill styles
import './asset-modal.css';

interface Props {
  asset: AuditResult;
  onClose: () => void;
  onConfirmed: () => void;
}

// Modal de marcação de dano — atalho direto pra [estado atual] → Danificado
// sem passar pelo ritual formal de "Receber devolução". Casos típicos:
// problema descoberto no estoque, substituição em campo, dano reportado
// pelo colaborador sem trazer a máquina ainda.
//
// Diferente do "Receber devolução → Spectra": aqui não há contexto de
// devolução. Por isso, sem campos NF/rastreio — só motivo e chamado
// opcional.
export default function DamageModal({ asset, onClose, onConfirmed }: Props) {
  const toast = useToast();
  const [defectNotes, setDefectNotes] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);

  // Se o ativo está EmUso, traz o colaborador atual no contexto pra
  // que o operador confirme que tá processando o ativo certo.
  const lastAssignment = asset.movementLogs
    .filter((l) => !l.isVoided && l.destinationStatus === 'EmUso')
    .at(-1);

  const currentHolder =
    asset.status === 'EmUso' && lastAssignment?.endUserName
      ? lastAssignment.department
        ? `${lastAssignment.endUserName}, ${lastAssignment.department}`
        : lastAssignment.endUserName
      : null;

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

    const motivo = defectNotes.trim();
    if (!motivo) {
      setError('Descreva o defeito observado (obrigatório).');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.registerMovement(asset.serialNumber, {
        destinationStatus: 'Danificado',
        ticketId: ticketId.trim() || undefined,
        notes: motivo,
      });
      toast.success('Movido para assistência');
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao marcar como danificado.');
      toast.error('Não foi possível marcar como danificado.');
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
        aria-label="Marcar ativo como danificado"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Reportar dano</span>
            <h2>Marcar como danificado</h2>
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

        {/* Contexto + transição: [estado atual] → Danificado */}
        <div className="movement-context">
          <div className="movement-context__asset">
            <AssetLocation unit={asset.currentUnit} />
            <span className="movement-context__model">{asset.model}</span>
            <code className="movement-context__serial">
              {asset.serialNumber}
              {currentHolder && ` · Em uso por ${currentHolder}`}
            </code>
          </div>
          <div
            className="movement-context__transition"
            aria-label="Transição de status"
          >
            <span className={`pill pill--${asset.status}`}>
              {STATUS_LABEL[asset.status]}
            </span>
            <span className="movement-context__arrow">→</span>
            <span className="pill pill--Danificado">
              {STATUS_LABEL.Danificado}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="asset-form">
          <label className="form-field">
            <span className="form-label">Defeito observado</span>
            <textarea
              ref={firstFieldRef}
              className="field"
              value={defectNotes}
              onChange={(e) => setDefectNotes(e.target.value)}
              placeholder="ex.: tela com fissura, bateria não carrega, teclado inoperante"
              rows={3}
              required
            />
          </label>

          <label className="form-field">
            <span className="form-label">
              Chamado{' '}
              <span className="form-label__hint">(opcional)</span>
            </span>
            <input
              className="field"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="ex.: 12345 — vincule se o dano partiu de um chamado"
              autoComplete="off"
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
              {submitting ? 'Marcando…' : 'Marcar como danificado'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
