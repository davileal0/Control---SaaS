import { useState } from 'react';
import { api, AuditResult } from '../lib/api';
import { Role, MovementLog, STATUS_LABEL, ROLE_LABEL, ASSIGNMENT_REASON_LABEL } from '../types/domain';
import { canWrite } from '../lib/rbac';
import TimelineLogActions from '../components/TimelineLogActions';
import { ShieldIcon } from '../components/icons';
import EditLogModal from './EditLogModal';
import VoidLogModal from './VoidLogModal';
import './audit.css';

interface Props {
  role: Role;
}

// Linha do Tempo de Auditoria: terminal de busca onde se digita qualquer
// serial_number (mesmo arquivado) e lê-se a jornada completa do hardware.
// Permite também editar e anular lançamentos (Operador N1 / Líder N1).
export default function AuditTimeline({ role }: Props) {
  const [serial, setSerial] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingLog, setEditingLog] = useState<MovementLog | null>(null);
  const [voidingLog, setVoidingLog] = useState<MovementLog | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = serial.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.audit(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na busca.');
    } finally {
      setLoading(false);
    }
  }

  // Refaz a busca após editar/anular. Mantém o serial atual.
  async function refetch() {
    if (!result) return;
    try {
      setResult(await api.audit(result.serialNumber));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao recarregar.');
    }
  }

  function handleConfirmed() {
    setEditingLog(null);
    setVoidingLog(null);
    refetch();
  }

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Trilha imutável</span>
        <h1>Auditoria</h1>
        <p>Busque um número de série para ver a jornada completa do ativo.</p>
      </div>

      <form className="audit-search" onSubmit={search}>
        <input
          className="field"
          placeholder="Digite o número de série (ex.: 5CD2419ABC)"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          aria-label="Número de série"
        />
        <button className="btn accent" type="submit" disabled={loading}>
          {loading ? 'Buscando…' : 'Consultar'}
        </button>
      </form>

      {error && <p className="audit-empty">{error}</p>}

      {result && (
        <section className="card audit-result">
          <header className="audit-result__head">
            <div>
              <span className="eyebrow">{result.category}</span>
              <h2>{result.model}</h2>
              <code className="audit-serial">{result.serialNumber}</code>
            </div>
            <div className="audit-state">
              <span className={`pill pill--${result.status}`}>
                {STATUS_LABEL[result.status]}
              </span>
              {result.isArchived && (
                <span className="pill pill--archived">Arquivado</span>
              )}
            </div>
          </header>

          {/* Subselling do diferencial técnico: deixa explícito que a
              auditoria é append-only. Lê-se em qualquer demo. */}
          <div className="immutability-badge" role="note">
            <span className="immutability-badge__icon" aria-hidden>
              <ShieldIcon size={14} />
            </span>
            <span className="immutability-badge__text">
              <strong>Trilha imutável.</strong> Cada lançamento é
              preservado no banco — edições e anulações ficam registradas
              como correções rastreáveis abaixo do lançamento original.
            </span>
          </div>

          <ol className="timeline">
            {result.movementLogs.map((log) => (
              <li
                key={log.id}
                className={`timeline__item ${log.isVoided ? 'timeline__item--voided' : ''}`}
              >
                <span className="timeline__dot" />
                <div className="timeline__body">
                  <div className="timeline__transition">
                    {log.originStatus ? STATUS_LABEL[log.originStatus] : 'Ingestão'}
                    <span className="timeline__arrow"> → </span>
                    {STATUS_LABEL[log.destinationStatus]}
                    {log.isVoided && <span className="tag tag--voided">Anulado</span>}
                    {!log.isVoided && log.corrections?.some((c) => c.operation === 'EDIT') && (
                      <span className="tag tag--edited">Editado</span>
                    )}
                  </div>
                  <div className="timeline__meta">
                    {new Date(log.timestamp).toLocaleString('pt-BR')}
                    {log.ticketId && ` · Chamado ${log.ticketId}`}
                    {log.endUserName && ` · ${log.endUserName}`}
                    {log.department && ` · ${log.department}`}
                    {log.invoiceNumber && ` · NF ${log.invoiceNumber}`}
                    {log.trackingCode && ` · Rastreio ${log.trackingCode}`}
                    {log.assignmentReason && ` · ${ASSIGNMENT_REASON_LABEL[log.assignmentReason]}`}
                  </div>
                  {log.notes && <p className="timeline__notes">{log.notes}</p>}

                  {/* Trilha imutável de correções deste lançamento */}
                  {log.corrections && log.corrections.length > 0 && (
                    <ul className="corrections">
                      {log.corrections.map((c) => (
                        <li key={c.id} className="corrections__row">
                          <span className={`corr-badge corr-badge--${c.operation}`}>
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
      )}

      {editingLog && (
        <EditLogModal
          log={editingLog}
          onClose={() => setEditingLog(null)}
          onConfirmed={handleConfirmed}
        />
      )}
      {voidingLog && (
        <VoidLogModal
          log={voidingLog}
          onClose={() => setVoidingLog(null)}
          onConfirmed={handleConfirmed}
        />
      )}
    </>
  );
}
