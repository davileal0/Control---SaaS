import { useEffect, useState } from 'react';
import { api, AuditResult } from '../lib/api';
import { STATUS_LABEL, ROLE_LABEL, Role, ASSIGNMENT_REASON_LABEL } from '../types/domain';
import AssetHero from './AssetHero';
import TicketRef from '../components/TicketRef';
import { canWrite } from '../lib/rbac';
import AssignModal from './AssignModal';
import ReceiveModal from './ReceiveModal';
import DamageModal from './DamageModal';
import DiscardModal from './DiscardModal';
import ReassignModal from './ReassignModal';
import RepairModal from './RepairModal';
import EditLogModal from './EditLogModal';
import VoidLogModal from './VoidLogModal';
import TimelineLogActions from '../components/TimelineLogActions';
import { ShieldIcon } from '../components/icons';
import { MovementLog } from '../types/domain';
import './peripherals-modal.css';
import './audit.css'; // reusa .timeline, .pill, .tag, .audit-serial
import './asset-modal.css';

interface Props {
  serial: string;
  role: Role;
  onClose: () => void;
  /** Chamado após qualquer operação que mude o estado do ativo (movimentação,
   *  descarte, etc.). O painel já refaz o fetch sozinho — esse callback é
   *  para o componente pai atualizar a lista de ativos. */
  onChange?: () => void;
}

// Painel de detalhe do ativo: metadata, localização atual, histórico, e
// ações contextuais aplicáveis ao estado atual. Cada ação abre um modal
// específico em cima deste painel; quando confirmada, o painel refaz o
// fetch e a transição aparece na timeline imediatamente.
export default function AssetDetailModal({
  serial,
  role,
  onClose,
  onChange,
}: Props) {
  const [data, setData] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [assigning, setAssigning] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [damaging, setDamaging] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [editingLog, setEditingLog] = useState<MovementLog | null>(null);
  const [voidingLog, setVoidingLog] = useState<MovementLog | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .audit(serial)
      .then((d) => alive && setData(d))
      .catch(
        (err) =>
          alive &&
          setError(err instanceof Error ? err.message : 'Falha ao carregar.'),
      );
    return () => {
      alive = false;
    };
  }, [serial, refreshKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc só fecha o painel se nenhum modal filho estiver aberto.
      if (
        e.key === 'Escape' &&
        !assigning &&
        !receiving &&
        !damaging &&
        !discarding &&
        !reassigning &&
        !repairing &&
        !editingLog &&
        !voidingLog
      ) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    onClose,
    assigning,
    receiving,
    damaging,
    discarding,
    reassigning,
    repairing,
    editingLog,
    voidingLog,
  ]);

  // Último log não-anulado, fonte da "localização atual" para itens Em Uso.
  const currentLog = data?.movementLogs.filter((l) => !l.isVoided).at(-1);

  function renderCurrentLocation() {
    if (!data) return null;
    if (data.isArchived) return 'Ativo arquivado (descartado definitivamente).';
    if (data.status === 'Disponivel') return 'No estoque, disponível para uso.';
    if (data.status === 'Danificado')
      return 'Enviado para assistência técnica (Spectra).';
    if (!currentLog || !currentLog.endUserName)
      return 'Em uso (sem dados do colaborador no registro).';
    const partes = [currentLog.endUserName];
    if (currentLog.department) partes.push(currentLog.department);
    const linha = `Em uso por ${partes.join(', ')}`;
    return currentLog.managerName
      ? `${linha} (líder: ${currentLog.managerName})`
      : linha;
  }

  // Lista de ações aplicáveis ao estado atual. `ready: true` significa
  // que a ação está implementada; `false` mostra o botão como placeholder
  // "em breve" (visível pra comunicar o escopo da plataforma).
  type Action = { key: string; label: string; ready: boolean; onClick?: () => void };

  function applicableActions(): Action[] {
    if (!data || data.isArchived || !canWrite(role)) return [];
    switch (data.status) {
      case 'Disponivel':
        return [
          {
            key: 'assign',
            label: 'Atribuir a colaborador',
            ready: true,
            onClick: () => setAssigning(true),
          },
          {
            key: 'damage',
            label: 'Marcar como danificado',
            ready: true,
            onClick: () => setDamaging(true),
          },
          {
            key: 'discard',
            label: 'Descartar definitivamente',
            ready: true,
            onClick: () => setDiscarding(true),
          },
        ];
      case 'EmUso':
        return [
          {
            key: 'return',
            label: 'Receber devolução',
            ready: true,
            onClick: () => setReceiving(true),
          },
          {
            key: 'reassign',
            label: 'Reaproveitar para outro colaborador',
            ready: true,
            onClick: () => setReassigning(true),
          },
          {
            key: 'damage',
            label: 'Marcar como danificado',
            ready: true,
            onClick: () => setDamaging(true),
          },
          {
            key: 'discard',
            label: 'Descartar definitivamente',
            ready: true,
            onClick: () => setDiscarding(true),
          },
        ];
      case 'Danificado':
        return [
          {
            key: 'repair',
            label: 'Marcar como reparado (volta ao estoque)',
            ready: true,
            onClick: () => setRepairing(true),
          },
          {
            key: 'discard',
            label: 'Descartar definitivamente',
            ready: true,
            onClick: () => setDiscarding(true),
          },
        ];
    }
  }

  const actions = applicableActions();

  function handleMovementConfirmed() {
    setAssigning(false);
    setReceiving(false);
    setDamaging(false);
    setDiscarding(false);
    setReassigning(false);
    setRepairing(false);
    setEditingLog(null);
    setVoidingLog(null);
    setRefreshKey((k) => k + 1); // refaz o fetch local
    onChange?.(); // notifica o pai (Assets) para refazer a lista
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal asset-detail-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes do ativo ${serial}`}
        onClick={(e) => e.stopPropagation()}
      >
        {error ? (
          <>
            <header className="modal__head">
              <div>
                <h2>Ativo não encontrado</h2>
              </div>
              <button className="btn" onClick={onClose}>
                Fechar
              </button>
            </header>
            <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>{error}</p>
          </>
        ) : !data ? (
          <p style={{ padding: 8, color: 'var(--text-muted)' }}>Carregando…</p>
        ) : (
          <>
            <AssetHero asset={data} onClose={onClose} />

            <section className="detail-section">
              <span className="eyebrow">Onde está agora</span>
              <p className="detail-current">{renderCurrentLocation()}</p>
            </section>

            <section className="detail-section">
              <span className="eyebrow">
                Histórico ({data.movementLogs.length})
              </span>

              {/* Subselling: deixa explícito que o histórico é
                  append-only. Coerente com a versão em AuditTimeline. */}
              <div className="immutability-badge" role="note">
                <span className="immutability-badge__icon" aria-hidden>
                  <ShieldIcon size={14} />
                </span>
                <span className="immutability-badge__text">
                  <strong>Trilha imutável.</strong> Edições e anulações
                  ficam registradas como correções abaixo do lançamento
                  original — o registro nunca é apagado.
                </span>
              </div>

              <ol className="timeline timeline--compact">
                {data.movementLogs.map((log) => (
                  <li
                    key={log.id}
                    className={`timeline__item ${log.isVoided ? 'timeline__item--voided' : ''}`}
                  >
                    <span className="timeline__dot" />
                    <div className="timeline__body">
                      <div className="timeline__transition">
                        {log.originStatus
                          ? STATUS_LABEL[log.originStatus]
                          : 'Ingestão'}
                        <span className="timeline__arrow"> → </span>
                        {STATUS_LABEL[log.destinationStatus]}
                        {log.isVoided && (
                          <span className="tag tag--voided">Anulado</span>
                        )}
                        {!log.isVoided &&
                          log.corrections?.some((c) => c.operation === 'EDIT') && (
                            <span className="tag tag--edited">Editado</span>
                          )}
                      </div>
                      <div className="timeline__meta">
                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                        {log.endUserName && ` · ${log.endUserName}`}
                        {log.department && ` · ${log.department}`}
                        {log.invoiceNumber && ` · NF ${log.invoiceNumber}`}
                        {log.trackingCode && ` · Rastreio ${log.trackingCode}`}
                        {log.assignmentReason && ` · ${ASSIGNMENT_REASON_LABEL[log.assignmentReason]}`}
                        {log.unitName && ` · 📍 ${log.unitName}`}
                      </div>
                      {log.ticketId && <TicketRef ticketId={log.ticketId} />}
                      {log.notes && <p className="timeline__notes">{log.notes}</p>}
                      {log.corrections && log.corrections.length > 0 && (
                        <ul className="corrections">
                          {log.corrections.map((c) => (
                            <li key={c.id} className="corrections__row">
                              <span
                                className={`corr-badge corr-badge--${c.operation}`}
                              >
                                {c.operation === 'VOID' ? 'Remoção' : 'Edição'}
                              </span>
                              <span className="corrections__text">
                                {c.reason}
                                <span className="corrections__by">
                                  {' '}— {c.actorName} ({ROLE_LABEL[c.actorRole]}),{' '}
                                  {new Date(c.createdAt).toLocaleString('pt-BR')}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <TimelineLogActions
                        log={log}
                        canWrite={canWrite(role)}
                        onEdit={() => setEditingLog(log)}
                        onVoid={() => setVoidingLog(log)}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {actions.length > 0 && (
              <section className="detail-section">
                <span className="eyebrow">Ações disponíveis</span>
                <div className="detail-actions-grid">
                  {actions.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      className={`btn ${a.ready ? 'accent' : ''}`}
                      disabled={!a.ready}
                      onClick={a.onClick}
                    >
                      <span>{a.label}</span>
                      {!a.ready && <span className="btn__hint">em breve</span>}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Modais empilhados — abrem por cima deste painel */}
      {assigning && data && (
        <AssignModal
          asset={data}
          onClose={() => setAssigning(false)}
          onConfirmed={handleMovementConfirmed}
        />
      )}
      {receiving && data && (
        <ReceiveModal
          asset={data}
          onClose={() => setReceiving(false)}
          onConfirmed={handleMovementConfirmed}
        />
      )}
      {damaging && data && (
        <DamageModal
          asset={data}
          onClose={() => setDamaging(false)}
          onConfirmed={handleMovementConfirmed}
        />
      )}
      {discarding && data && (
        <DiscardModal
          asset={data}
          onClose={() => setDiscarding(false)}
          onConfirmed={handleMovementConfirmed}
        />
      )}
      {reassigning && data && (
        <ReassignModal
          asset={data}
          onClose={() => setReassigning(false)}
          onConfirmed={handleMovementConfirmed}
        />
      )}
      {repairing && data && (
        <RepairModal
          asset={data}
          onClose={() => setRepairing(false)}
          onConfirmed={handleMovementConfirmed}
        />
      )}
      {editingLog && (
        <EditLogModal
          log={editingLog}
          onClose={() => setEditingLog(null)}
          onConfirmed={handleMovementConfirmed}
        />
      )}
      {voidingLog && (
        <VoidLogModal
          log={voidingLog}
          onClose={() => setVoidingLog(null)}
          onConfirmed={handleMovementConfirmed}
        />
      )}
    </div>
  );
}
