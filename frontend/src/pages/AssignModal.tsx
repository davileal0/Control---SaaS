import { useEffect, useRef, useState, FormEvent } from 'react';
import { api, AuditResult } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { STATUS_LABEL, AssignmentReason } from '../types/domain';
import './peripherals-modal.css';
import './audit.css'; // pill styles
import './asset-modal.css';

interface Props {
  asset: AuditResult;
  onClose: () => void;
  onConfirmed: () => void;
}

// Modal de atribuição: cobre os Fluxos A (Aumento de quadro) e B saída
// (Substituição saída). Operação concreta: Disponível → Em Uso, com
// chamado, colaborador, líder e setor obrigatórios.
//
// O motivo da atribuição (`assignmentReason`) também é OBRIGATÓRIO desde
// a iteração de KPIs — alimenta a métrica "este mês: N aumentos de
// quadro vs M substituições".
export default function AssignModal({ asset, onClose, onConfirmed }: Props) {
  const toast = useToast();
  const [ticketId, setTicketId] = useState('');
  const [endUserName, setEndUserName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [department, setDepartment] = useState('');
  // String vazia força o operador a escolher conscientemente. Sem
  // default pra evitar viés (sempre marca o 1º se houver default).
  const [assignmentReason, setAssignmentReason] = useState<
    AssignmentReason | ''
  >('');
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

    const ticket = ticketId.trim();
    const user = endUserName.trim();
    const manager = managerName.trim();
    const dept = department.trim();

    if (!ticket || !user || !manager || !dept) {
      setError('Chamado, colaborador, líder e setor são obrigatórios.');
      return;
    }
    if (!assignmentReason) {
      setError('Selecione o motivo da atribuição.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.registerMovement(asset.serialNumber, {
        destinationStatus: 'EmUso',
        ticketId: ticket,
        endUserName: user,
        managerName: manager,
        department: dept,
        assignmentReason,
        notes: notes.trim() || undefined,
      });
      toast.success(`Atribuído a ${user}`);
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar atribuição.');
      toast.error('Não foi possível registrar a atribuição.');
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
        aria-label="Atribuir ativo a colaborador"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Saída de estoque</span>
            <h2>Atribuir a colaborador</h2>
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

        {/* Contexto: ativo + transição visual reforça o que vai acontecer */}
        <div className="movement-context">
          <div className="movement-context__asset">
            <span className="movement-context__model">{asset.model}</span>
            <code className="movement-context__serial">{asset.serialNumber}</code>
          </div>
          <div className="movement-context__transition" aria-label="Transição de status">
            <span className="pill pill--Disponivel">{STATUS_LABEL.Disponivel}</span>
            <span className="movement-context__arrow">→</span>
            <span className="pill pill--EmUso">{STATUS_LABEL.EmUso}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="asset-form">
          <label className="form-field">
            <span className="form-label">Chamado (Acelerato)</span>
            <input
              ref={firstFieldRef}
              className="field"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="ex.: 12345"
              autoComplete="off"
              required
            />
          </label>

          <div className="form-row">
            <label className="form-field">
              <span className="form-label">Colaborador</span>
              <input
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

          <label className="form-field">
            <span className="form-label">Motivo da atribuição</span>
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

          <label className="form-field">
            <span className="form-label">Observações (opcional)</span>
            <textarea
              className="field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex.: Novo dev no time de produto"
              rows={3}
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
            <button type="submit" className="btn accent" disabled={submitting}>
              {submitting ? 'Atribuindo…' : 'Confirmar atribuição'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
