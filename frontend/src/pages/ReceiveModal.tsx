import { useEffect, useRef, useState, FormEvent } from 'react';
import { api, AuditResult } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { STATUS_LABEL } from '../types/domain';
import AssetLocation from '../components/AssetLocation';
import UnitSelectField from '../components/UnitSelectField';
import { useUnits } from '../lib/useUnits';
import './peripherals-modal.css';
import './audit.css'; // pill styles
import './asset-modal.css';

interface Props {
  asset: AuditResult;
  onClose: () => void;
  onConfirmed: () => void;
}

type Destination = 'Disponivel' | 'Danificado';

// Modal de recebimento de devolução: cobre os Fluxos B (Devolução com
// chamado, almoxarifado/substituição) e C (Devolução presencial).
//
// Operação: Em Uso → Disponível (volta ao estoque) OU Em Uso → Danificado
// (envia à Spectra). O operador escolhe o destino conforme o resultado
// dos testes físicos. Dois botões de confirmação no rodapé tornam a
// escolha explícita e em um único clique.
//
// Campos:
//  - Chamado, NF, rastreio: opcionais (apenas devolução remota usa)
//  - Observações: obrigatórias QUANDO destino = Danificado (auditoria)
export default function ReceiveModal({ asset, onClose, onConfirmed }: Props) {
  const toast = useToast();
  const units = useUnits();
  const [unitId, setUnitId] = useState(asset.currentUnit?.id ?? '');
  const [ticketId, setTicketId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [notes, setNotes] = useState('');
  const [submittingTo, setSubmittingTo] = useState<Destination | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Último log não-anulado: fonte de quem está devolvendo o ativo.
  const lastAssignment = asset.movementLogs
    .filter((l) => !l.isVoided && l.destinationStatus === 'EmUso')
    .at(-1);

  const currentHolder = lastAssignment?.endUserName
    ? lastAssignment.department
      ? `${lastAssignment.endUserName}, ${lastAssignment.department}`
      : lastAssignment.endUserName
    : null;

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && submittingTo === null) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submittingTo]);

  async function handleReceive(
    destination: Destination,
    e?: FormEvent,
  ) {
    e?.preventDefault();

    // Justificativa obrigatória quando vai pra assistência. Sem isso,
    // o relatório futuro de "onde foram os notebooks" fica vago.
    if (destination === 'Danificado' && !notes.trim()) {
      setError(
        'Descreva o defeito observado para enviar à assistência técnica.',
      );
      return;
    }

    setSubmittingTo(destination);
    setError(null);
    try {
      await api.registerMovement(asset.serialNumber, {
        destinationStatus: destination,
        ticketId: ticketId.trim() || undefined,
        invoiceNumber: invoiceNumber.trim() || undefined,
        trackingCode: trackingCode.trim() || undefined,
        notes: notes.trim() || undefined,
        unitId: unitId || undefined,
      });
      const destLabel = destination === 'Disponivel' ? 'Disponível' : 'Em assistência';
      toast.success(`Recebido. Status: ${destLabel}`);
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar devolução.');
      toast.error('Não foi possível registrar a devolução.');
      setSubmittingTo(null);
    }
  }

  const isSubmitting = submittingTo !== null;

  return (
    <div
      className="modal-backdrop modal-backdrop--stacked"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        className="modal movement-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Receber devolução do ativo"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Devolução do colaborador</span>
            <h2>Receber devolução</h2>
          </div>
          <button
            className="btn"
            onClick={onClose}
            type="button"
            disabled={isSubmitting}
          >
            Fechar
          </button>
        </header>

        {/* Contexto: ativo + de quem está vindo + transição com 2 destinos */}
        <div className="movement-context">
          <div className="movement-context__asset">
            <AssetLocation unit={asset.currentUnit} />
            <span className="movement-context__model">{asset.model}</span>
            <code className="movement-context__serial">
              {asset.serialNumber}
              {currentHolder && ` · Devolvendo de ${currentHolder}`}
            </code>
          </div>
          <div
            className="movement-context__transition"
            aria-label="Destinos possíveis da transição"
          >
            <span className="pill pill--EmUso">{STATUS_LABEL.EmUso}</span>
            <span className="movement-context__arrow">→</span>
            <span className="pill pill--Disponivel">
              {STATUS_LABEL.Disponivel}
            </span>
            <span className="movement-context__or">ou</span>
            <span className="pill pill--Danificado">
              {STATUS_LABEL.Danificado}
            </span>
          </div>
        </div>

        <p className="movement-hint">
          O destino depende do estado físico do equipamento após os testes.
          Escolha no rodapé.
        </p>

        <form
          className="asset-form"
          onSubmit={(e) => {
            // Enter no formulário não tem destino óbvio aqui — bloqueia
            // submit acidental. Só os botões da footer disparam ações.
            e.preventDefault();
          }}
        >
          <label className="form-field">
            <span className="form-label">Chamado (Acelerato)</span>
            <input
              ref={firstFieldRef}
              className="field"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="ex.: 12345 — deixe em branco se for devolução presencial"
              autoComplete="off"
            />
          </label>

          <div className="form-row">
            <label className="form-field">
              <span className="form-label">Nota fiscal</span>
              <input
                className="field"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="opcional — devolução remota"
                autoComplete="off"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Código de rastreio</span>
              <input
                className="field"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                placeholder="opcional — Correios/transportadora"
                autoComplete="off"
              />
            </label>
          </div>

          <label className="form-field">
            <span className="form-label">
              Observações{' '}
              <span className="form-label__hint">
                (obrigatório para Danificado)
              </span>
            </span>
            <textarea
              className="field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex.: máquina testada e aprovada / tela com defeito, bateria não carrega"
              rows={3}
            />
          </label>

          <UnitSelectField units={units} value={unitId} onChange={setUnitId} />

          {error && <p className="form-error">{error}</p>}

          <footer className="form-footer form-footer--dual">
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <div className="form-footer__choices">
              <button
                type="button"
                className="btn accent"
                onClick={() => handleReceive('Disponivel')}
                disabled={isSubmitting}
              >
                {submittingTo === 'Disponivel'
                  ? 'Recebendo…'
                  : 'Voltar ao estoque'}
              </button>
              <button
                type="button"
                className="btn warning"
                onClick={() => handleReceive('Danificado')}
                disabled={isSubmitting}
              >
                {submittingTo === 'Danificado'
                  ? 'Enviando…'
                  : 'Enviar à Spectra'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
