import { useEffect, useRef, useState, FormEvent } from 'react';
import { api, AuditResult } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { STATUS_LABEL } from '../types/domain';
import AssetLocation from '../components/AssetLocation';
import UnitSelectField from '../components/UnitSelectField';
import { useUnits } from '../lib/useUnits';
import './peripherals-modal.css';
import './audit.css';
import './asset-modal.css';

interface Props {
  asset: AuditResult;
  onClose: () => void;
  onConfirmed: () => void;
}

// Modal de reparo: Danificado → Disponível. Fecha o ciclo de vida do
// ativo após o retorno da assistência técnica (Spectra) ou reparo
// interno. Sem o caminho oposto a "Marcar danificado", uma máquina
// reparada ficaria presa em Danificado pra sempre.
//
// Descrição do reparo é obrigatória: o que foi feito ("tela trocada",
// "bateria substituída", "aprovado em teste sem componente novo")
// ajuda muito na auditoria futura — quem olhar o histórico em 6 meses
// vai entender o ciclo de vida completo da máquina.
export default function RepairModal({ asset, onClose, onConfirmed }: Props) {
  const toast = useToast();
  const units = useUnits();
  const [unitId, setUnitId] = useState(asset.currentUnit?.id ?? '');
  const [repairNotes, setRepairNotes] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);

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

    const descricao = repairNotes.trim();
    if (!descricao) {
      setError('Descreva o reparo realizado (obrigatório).');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.registerMovement(asset.serialNumber, {
        destinationStatus: 'Disponivel',
        ticketId: ticketId.trim() || undefined,
        invoiceNumber: invoiceNumber.trim() || undefined,
        notes: descricao,
        unitId: unitId || undefined,
      });
      toast.success('Equipamento volta ao estoque');
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao marcar como reparado.');
      toast.error('Não foi possível marcar como reparado.');
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
        aria-label="Marcar ativo como reparado"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Retorno ao estoque</span>
            <h2>Marcar como reparado</h2>
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

        {/* Contexto + transição: Danificado → Disponível */}
        <div className="movement-context">
          <div className="movement-context__asset">
            <AssetLocation unit={asset.currentUnit} />
            <span className="movement-context__model">{asset.model}</span>
            <code className="movement-context__serial">
              {asset.serialNumber}
            </code>
          </div>
          <div
            className="movement-context__transition"
            aria-label="Transição de status"
          >
            <span className="pill pill--Danificado">
              {STATUS_LABEL.Danificado}
            </span>
            <span className="movement-context__arrow">→</span>
            <span className="pill pill--Disponivel">
              {STATUS_LABEL.Disponivel}
            </span>
          </div>
        </div>

        <p className="movement-hint">
          A máquina volta ao estoque ativo e fica disponível pra ser atribuída
          a um colaborador. O histórico anterior (defeito, envio à assistência)
          permanece registrado.
        </p>

        <form onSubmit={handleSubmit} className="asset-form">
          <label className="form-field">
            <span className="form-label">Descrição do reparo</span>
            <textarea
              ref={firstFieldRef}
              className="field"
              value={repairNotes}
              onChange={(e) => setRepairNotes(e.target.value)}
              placeholder="ex.: tela trocada pela Spectra / bateria substituída / aprovada após teste sem troca de componentes"
              rows={3}
              required
            />
          </label>

          <div className="form-row">
            <label className="form-field">
              <span className="form-label">
                Chamado{' '}
                <span className="form-label__hint">(opcional)</span>
              </span>
              <input
                className="field"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                placeholder="ex.: chamado da Spectra"
                autoComplete="off"
              />
            </label>
            <label className="form-field">
              <span className="form-label">
                Nota fiscal{' '}
                <span className="form-label__hint">(opcional)</span>
              </span>
              <input
                className="field"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="ex.: NF do reparo"
                autoComplete="off"
              />
            </label>
          </div>

          <UnitSelectField units={units} value={unitId} onChange={setUnitId} />

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
              {submitting ? 'Registrando…' : 'Confirmar reparo'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
