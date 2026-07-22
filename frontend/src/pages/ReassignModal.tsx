import { useEffect, useRef, useState, FormEvent } from 'react';
import {
  api,
  AuditResult,
  PeripheralTypeStock,
  AssignmentIntentSuggestion,
} from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { AssignmentReason } from '../types/domain';
import PeripheralDeliveryPicker from './PeripheralDeliveryPicker';
import './peripherals-modal.css';
import './audit.css';
import './asset-modal.css';

interface Props {
  asset: AuditResult;
  onClose: () => void;
  onConfirmed: () => void;
}

// Modal de reaproveitamento direto. Implementa o Fluxo D do MVP: mesma
// máquina muda de colaborador SEM voltar fisicamente ao estoque.
//
// O backend grava DOIS lançamentos atômicos na mesma transação (devolução
// do anterior + nova atribuição). Se a segunda inserção falhar, o
// Postgres reverte a primeira automaticamente — nunca fica auditoria
// inconsistente.
//
// O modal mostra explicitamente o "De → Para" pra reforçar visualmente
// o cross-over: dados do colaborador anterior em read-only no topo,
// formulário do novo embaixo.
export default function ReassignModal({ asset, onClose, onConfirmed }: Props) {
  const toast = useToast();
  const [returnTicketId, setReturnTicketId] = useState('');
  const [newTicketId, setNewTicketId] = useState('');
  const [endUserName, setEndUserName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [department, setDepartment] = useState('');
  const [assignmentReason, setAssignmentReason] = useState<
    AssignmentReason | ''
  >('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [intents, setIntents] = useState<AssignmentIntentSuggestion[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Entrega de periféricos junto (só pra ativo rastreável).
  const canDeliverPeripherals = asset.category !== 'Periferico';
  const [deliverOn, setDeliverOn] = useState(false);
  const [deliveries, setDeliveries] = useState<Record<string, number>>({});
  const [stock, setStock] = useState<PeripheralTypeStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);

  // Identifica o colaborador anterior a partir do último log não-anulado.
  // Se não houver dados (ativo Em Uso sem log claro, caso de borda), mostra
  // um aviso e bloqueia confirmação.
  const lastAssignment = asset.movementLogs
    .filter((l) => !l.isVoided && l.destinationStatus === 'EmUso')
    .at(-1);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  // Carrega o estoque por tipo ao abrir (só se for ativo rastreável).
  useEffect(() => {
    if (!canDeliverPeripherals) return;
    setLoadingStock(true);
    api
      .peripheralTypeStock()
      .then(setStock)
      .catch(() => {})
      .finally(() => setLoadingStock(false));
  }, [canDeliverPeripherals]);

  // Sugestões de intenção pro autocomplete, conforme o motivo escolhido.
  useEffect(() => {
    if (!assignmentReason) {
      setIntents([]);
      return;
    }
    api
      .assignmentIntents(assignmentReason)
      .then(setIntents)
      .catch(() => setIntents([]));
  }, [assignmentReason]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const ticket = newTicketId.trim();
    const user = endUserName.trim();
    const manager = managerName.trim();
    const dept = department.trim();

    if (!ticket || !user || !manager || !dept) {
      setError(
        'Chamado da nova atribuição, colaborador, líder e setor são obrigatórios.',
      );
      return;
    }
    if (!assignmentReason) {
      setError('Selecione o motivo da nova atribuição.');
      return;
    }

    // Kit de periféricos (se ativado). Quantidade já limitada ao estoque.
    let peripherals: { type: string; quantity: number }[] | undefined;
    if (deliverOn) {
      const items = Object.entries(deliveries).map(([type, quantity]) => ({
        type,
        quantity,
      }));
      const over = items.find((it) => {
        const avail = stock.find((s) => s.type === it.type)?.available ?? 0;
        return it.quantity > avail;
      });
      if (over) {
        setError(
          `Estoque insuficiente de "${over.type}". Reponha antes de entregar.`,
        );
        return;
      }
      peripherals = items.length > 0 ? items : undefined;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.reassignAsset(asset.serialNumber, {
        returnTicketId: returnTicketId.trim() || undefined,
        newTicketId: ticket,
        endUserName: user,
        managerName: manager,
        department: dept,
        assignmentReason,
        assignmentReasonDetail: reasonDetail.trim() || undefined,
        notes: notes.trim() || undefined,
        peripherals,
      });
      toast.success(`Reaproveitado para ${user}`);
      onConfirmed();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao reaproveitar o ativo.',
      );
      toast.error('Não foi possível reaproveitar o ativo.');
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
        aria-label="Reaproveitar ativo para outro colaborador"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Reaproveitamento direto</span>
            <h2>Reaproveitar para outro colaborador</h2>
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

        {/* Contexto do ativo (cabeçalho minimal — sem transição,
            porque o estado inicial e final são iguais: EmUso) */}
        <div className="movement-context">
          <div className="movement-context__asset">
            <span className="movement-context__model">{asset.model}</span>
            <code className="movement-context__serial">
              {asset.serialNumber}
            </code>
          </div>
          <div
            className="movement-context__transition"
            aria-label="Transição lógica do ativo"
          >
            <span className="pill pill--EmUso">Em Uso</span>
            <span className="movement-context__arrow">→</span>
            <span className="pill pill--EmUso">Em Uso</span>
          </div>
        </div>

        <p className="movement-hint">
          Dois lançamentos serão gravados na mesma transação: devolução do
          colaborador anterior e nova atribuição. Se algo falhar, ambos
          são revertidos juntos.
        </p>

        <form onSubmit={handleSubmit} className="asset-form">
          {/* Bloco DE — colaborador anterior, read-only */}
          <div className="reassign-block reassign-block--from">
            <span className="reassign-block__label">De</span>
            {lastAssignment?.endUserName ? (
              <div className="reassign-block__content">
                <strong>{lastAssignment.endUserName}</strong>
                {lastAssignment.department && (
                  <span className="reassign-block__meta">
                    {lastAssignment.department}
                  </span>
                )}
                {lastAssignment.managerName && (
                  <span className="reassign-block__meta">
                    Líder: {lastAssignment.managerName}
                  </span>
                )}
              </div>
            ) : (
              <p className="reassign-block__warning">
                Sem dados do colaborador anterior no histórico (a devolução
                ainda será registrada, mas sem referência nominal).
              </p>
            )}
          </div>

          <div className="reassign-divider" aria-hidden="true">
            <span>↓</span>
          </div>

          {/* Bloco PARA — novo colaborador, editável */}
          <div className="reassign-block reassign-block--to">
            <span className="reassign-block__label">Para</span>

            <div className="form-row">
              <label className="form-field">
                <span className="form-label">Colaborador</span>
                <input
                  ref={firstFieldRef}
                  className="field"
                  value={endUserName}
                  onChange={(e) => setEndUserName(e.target.value)}
                  placeholder="Nome completo"
                  autoComplete="off"
                  required
                />
              </label>
              <label className="form-field">
                <span className="form-label">Setor</span>
                <input
                  className="field"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="ex.: Comercial"
                  autoComplete="off"
                  required
                />
              </label>
            </div>

            <label className="form-field">
              <span className="form-label">Líder direto</span>
              <input
                className="field"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="Nome completo do líder"
                autoComplete="off"
                required
              />
            </label>
          </div>

          {/* Bloco CHAMADOS — os dois chamados vinculados */}
          <div className="form-row">
            <label className="form-field">
              <span className="form-label">
                Chamado da devolução{' '}
                <span className="form-label__hint">(opcional)</span>
              </span>
              <input
                className="field"
                value={returnTicketId}
                onChange={(e) => setReturnTicketId(e.target.value)}
                placeholder="ex.: 12345 — chamado de substituição do anterior"
                autoComplete="off"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Chamado da nova atribuição</span>
              <input
                className="field"
                value={newTicketId}
                onChange={(e) => setNewTicketId(e.target.value)}
                placeholder="ex.: 12346"
                autoComplete="off"
                required
              />
            </label>
          </div>

          <label className="form-field">
            <span className="form-label">Motivo da nova atribuição</span>
            <select
              className="field"
              value={assignmentReason}
              onChange={(e) =>
                setAssignmentReason(e.target.value as AssignmentReason | '')
              }
              required
            >
              <option value="">Selecione…</option>
              <option value="AUMENTO_QUADRO">Aumento de quadro</option>
              <option value="SUBSTITUICAO">Substituição</option>
            </select>
          </label>

          {assignmentReason && (
            <label className="form-field">
              <span className="form-label">
                Intenção / detalhe{' '}
                <span className="form-label__hint">(opcional)</span>
              </span>
              <input
                className="field"
                list="reassign-intents"
                value={reasonDetail}
                onChange={(e) => setReasonDetail(e.target.value)}
                placeholder={
                  assignmentReason === 'SUBSTITUICAO'
                    ? 'ex.: Upgrade IFS'
                    : 'ex.: Migração Empresa X'
                }
                autoComplete="off"
                maxLength={120}
              />
              <datalist id="reassign-intents">
                {intents.map((i) => (
                  <option key={i.detail} value={i.detail}>
                    {`usado ${i.count}x`}
                  </option>
                ))}
              </datalist>
            </label>
          )}

          <label className="form-field">
            <span className="form-label">Observações (opcional)</span>
            <textarea
              className="field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex.: máquina testada após devolução do anterior, sem defeitos"
              rows={3}
            />
          </label>

          {/* Entrega de periféricos junto (só pra ativo rastreável) */}
          {canDeliverPeripherals && (
            <div className="periph-deliver">
              <label className="periph-deliver__toggle">
                <input
                  type="checkbox"
                  checked={deliverOn}
                  onChange={(e) => setDeliverOn(e.target.checked)}
                />
                <span>Entregar periféricos junto</span>
              </label>
              {deliverOn && (
                <PeripheralDeliveryPicker
                  stock={stock}
                  value={deliveries}
                  onChange={setDeliveries}
                  loading={loadingStock}
                />
              )}
            </div>
          )}

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
              {submitting ? 'Reaproveitando…' : 'Confirmar reaproveitamento'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
