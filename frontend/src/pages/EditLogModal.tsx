import { useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import { api, EditableFields } from '../lib/api';
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

// Normaliza valor de campo: trim + vazio vira null (limpar o campo).
function norm(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

// Identifica qual o "tipo" do log a partir das transições. O backend é
// genérico (tabela movement_logs serve pra tudo), mas a UI precisa se
// adaptar ao propósito: o operador não quer ver campo de "líder" num
// log de descarte, nem de "rastreio" num log de atribuição interna.
type LogPurpose = 'discard' | 'assign' | 'return' | 'damage' | 'generic';

function classifyLog(log: MovementLog): LogPurpose {
  // Assinatura do discardAsset no backend: origem === destino.
  if (log.originStatus === log.destinationStatus) return 'discard';
  if (log.destinationStatus === 'EmUso') return 'assign';
  if (log.destinationStatus === 'Danificado') return 'damage';
  if (
    log.originStatus === 'EmUso' &&
    log.destinationStatus === 'Disponivel'
  ) {
    return 'return';
  }
  return 'generic';
}

// Define quais campos são editáveis em cada tipo de log. Campos fora
// dessa lista permanecem fixos com seu valor atual (não vão pro diff).
//
// "notes" está sempre presente — é o único campo verdadeiramente
// universal entre os tipos.
const FIELDS_BY_PURPOSE: Record<LogPurpose, Set<keyof EditableFields>> = {
  discard: new Set(['notes']),
  assign: new Set(['ticketId', 'endUserName', 'managerName', 'department', 'notes']),
  return: new Set(['ticketId', 'invoiceNumber', 'trackingCode', 'notes']),
  damage: new Set(['ticketId', 'notes']),
  generic: new Set([
    'ticketId',
    'endUserName',
    'managerName',
    'department',
    'invoiceNumber',
    'trackingCode',
    'notes',
  ]),
};

// Rótulo do campo "notes" varia conforme o contexto.
function notesLabelFor(purpose: LogPurpose): string {
  switch (purpose) {
    case 'discard':
      return 'Motivo do descarte';
    case 'damage':
      return 'Defeito observado';
    default:
      return 'Observações';
  }
}

// Modal de correção de lançamento. Mostra apenas os campos que fazem
// sentido pro TIPO do log (descarte, atribuição, devolução, etc).
// Ao confirmar, envia o diff (só os campos alterados) + motivo
// obrigatório. Backend registra na trilha imutável de correções.
export default function EditLogModal({ log, onClose, onConfirmed }: Props) {
  const toast = useToast();
  const purpose = useMemo(() => classifyLog(log), [log]);
  const visibleFields = FIELDS_BY_PURPOSE[purpose];

  const [ticketId, setTicketId] = useState(log.ticketId ?? '');
  const [endUserName, setEndUserName] = useState(log.endUserName ?? '');
  const [managerName, setManagerName] = useState(log.managerName ?? '');
  const [department, setDepartment] = useState(log.department ?? '');
  const [invoiceNumber, setInvoiceNumber] = useState(log.invoiceNumber ?? '');
  const [trackingCode, setTrackingCode] = useState(log.trackingCode ?? '');
  const [notes, setNotes] = useState(log.notes ?? '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

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

    // Computa o diff campo-a-campo. Só envia campos visíveis E que mudaram.
    const fields: EditableFields = {};
    const compare = [
      { key: 'ticketId' as const, current: log.ticketId, next: norm(ticketId) },
      { key: 'endUserName' as const, current: log.endUserName, next: norm(endUserName) },
      { key: 'managerName' as const, current: log.managerName, next: norm(managerName) },
      { key: 'department' as const, current: log.department, next: norm(department) },
      { key: 'invoiceNumber' as const, current: log.invoiceNumber, next: norm(invoiceNumber) },
      { key: 'trackingCode' as const, current: log.trackingCode, next: norm(trackingCode) },
      { key: 'notes' as const, current: log.notes, next: norm(notes) },
    ];

    for (const { key, current, next } of compare) {
      if (!visibleFields.has(key)) continue; // não consideramos campos escondidos
      const c = current ?? null;
      if (c !== next) {
        fields[key] = next;
      }
    }

    if (Object.keys(fields).length === 0) {
      setError('Nenhum campo foi alterado.');
      return;
    }

    const motivo = reason.trim();
    if (motivo.length < 5) {
      setError('Motivo da correção obrigatório (mínimo 5 caracteres).');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.editMovement(log.id, { reason: motivo, fields });
      toast.success('Lançamento atualizado');
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao editar o lançamento.');
      toast.error('Não foi possível editar o lançamento.');
      setSubmitting(false);
    }
  }

  // Resumo curto do lançamento — confirma visualmente qual log é
  const transitionSummary = log.originStatus
    ? purpose === 'discard'
      ? `Descarte registrado em ${STATUS_LABEL[log.originStatus]}`
      : `${STATUS_LABEL[log.originStatus]} → ${STATUS_LABEL[log.destinationStatus]}`
    : `Ingestão → ${STATUS_LABEL[log.destinationStatus]}`;

  const showsPersonRow =
    visibleFields.has('endUserName') || visibleFields.has('department');
  const showsTicketRow =
    visibleFields.has('ticketId') || visibleFields.has('invoiceNumber');

  return (
    <div
      className="modal-backdrop modal-backdrop--stacked"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="modal movement-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Editar lançamento"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Correção de lançamento</span>
            <h2>Editar lançamento</h2>
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

        {/* Contexto: qual lançamento está sendo corrigido */}
        <div className="movement-context">
          <div className="movement-context__asset">
            <span className="movement-context__model">{transitionSummary}</span>
            <code className="movement-context__serial">
              {new Date(log.timestamp).toLocaleString('pt-BR')}
            </code>
          </div>
        </div>

        <p className="movement-hint">
          {purpose === 'discard'
            ? 'No log de descarte só faz sentido corrigir o motivo. A edição é registrada na trilha imutável com seu nome, data, motivo e diff.'
            : 'A edição é registrada na trilha imutável de correções com seu nome, data, motivo e o diff campo-a-campo. Apenas metadados — não dá pra alterar a transição de status.'}
        </p>

        <form onSubmit={handleSubmit} className="asset-form">
          {/* Chamado / NF — só quando relevante */}
          {showsTicketRow && (
            <div className="form-row">
              {visibleFields.has('ticketId') && (
                <label className="form-field">
                  <span className="form-label">Chamado</span>
                  <input
                    ref={
                      // Foco vai no primeiro campo visível
                      firstFieldRef as React.RefObject<HTMLInputElement>
                    }
                    className="field"
                    value={ticketId}
                    onChange={(e) => setTicketId(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              )}
              {visibleFields.has('invoiceNumber') && (
                <label className="form-field">
                  <span className="form-label">Nota fiscal</span>
                  <input
                    className="field"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              )}
            </div>
          )}

          {visibleFields.has('trackingCode') && (
            <label className="form-field">
              <span className="form-label">Código de rastreio</span>
              <input
                className="field"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                autoComplete="off"
              />
            </label>
          )}

          {/* Pessoas — só pra logs de atribuição/reaproveitamento */}
          {showsPersonRow && (
            <div className="form-row">
              {visibleFields.has('endUserName') && (
                <label className="form-field">
                  <span className="form-label">Colaborador</span>
                  <input
                    className="field"
                    value={endUserName}
                    onChange={(e) => setEndUserName(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              )}
              {visibleFields.has('department') && (
                <label className="form-field">
                  <span className="form-label">Setor</span>
                  <input
                    className="field"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              )}
            </div>
          )}

          {visibleFields.has('managerName') && (
            <label className="form-field">
              <span className="form-label">Líder direto</span>
              <input
                className="field"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                autoComplete="off"
              />
            </label>
          )}

          {/* Notes — sempre presente, rótulo varia */}
          {visibleFields.has('notes') && (
            <label className="form-field">
              <span className="form-label">{notesLabelFor(purpose)}</span>
              <textarea
                ref={
                  // Quando é descarte, o foco inicial é aqui (único campo visível
                  // antes do motivo)
                  purpose === 'discard'
                    ? (firstFieldRef as React.RefObject<HTMLTextAreaElement>)
                    : undefined
                }
                className="field"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={purpose === 'discard' ? 3 : 2}
              />
            </label>
          )}

          {/* Motivo da correção — sempre obrigatório, sempre separado visualmente */}
          <div className="correction-reason">
            <label className="form-field">
              <span className="form-label">
                Motivo da correção{' '}
                <span className="form-label__hint">
                  (obrigatório, mínimo 5 caracteres)
                </span>
              </span>
              <textarea
                className="field"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  purpose === 'discard'
                    ? 'ex.: motivo do descarte estava incompleto'
                    : 'ex.: erro de digitação no chamado / setor estava errado'
                }
                rows={2}
                required
              />
            </label>
          </div>

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
              {submitting ? 'Salvando…' : 'Salvar correção'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
