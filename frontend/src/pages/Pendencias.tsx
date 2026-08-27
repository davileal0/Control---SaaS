import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PeripheralPendency, Role } from '../types/domain';
import { canWrite } from '../lib/rbac';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import './pendencias.css';

interface Props {
  role: Role | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Página de Pendências: periféricos solicitados em chamados que não foram
// entregues na atribuição. Resolver = entregar agora (baixa no estoque).
export default function Pendencias({ role }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<PeripheralPendency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const writable = role ? canWrite(role) : false;

  async function reload() {
    setLoading(true);
    try {
      setItems(await api.listPendencies(showAll ? undefined : 'PENDENTE'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar pendências.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  async function resolve(p: PeripheralPendency) {
    if (
      !window.confirm(
        `Entregar ${p.quantity}x ${p.peripheralType} agora? Isso dá baixa no estoque.`,
      )
    )
      return;
    setBusyId(p.id);
    try {
      await api.resolvePendency(p.id);
      toast.success(`${p.peripheralType} entregue — baixa no estoque feita.`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao resolver.');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(p: PeripheralPendency) {
    if (!window.confirm(`Cancelar a pendência de ${p.peripheralType}?`)) return;
    setBusyId(p.id);
    try {
      await api.cancelPendency(p.id);
      toast.success('Pendência cancelada.');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao cancelar.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Operação</span>
        <h1>Pendências</h1>
        <p>
          Periféricos solicitados em chamados que ainda não foram entregues.
          Ao resolver, a Control dá baixa no estoque no momento da entrega.
        </p>
      </div>

      <div className="pend-toolbar">
        <button
          type="button"
          className={`filter-pill ${!showAll ? 'filter-pill--on' : ''}`}
          onClick={() => setShowAll(false)}
        >
          Pendentes
        </button>
        <button
          type="button"
          className={`filter-pill ${showAll ? 'filter-pill--on' : ''}`}
          onClick={() => setShowAll(true)}
        >
          Todas
        </button>
      </div>

      {loading ? (
        <div className="spinner-center">
          <Spinner size={28} />
          <span>Carregando…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="card pend-empty">
          {showAll
            ? 'Nenhuma pendência registrada.'
            : 'Nenhuma pendência aberta. Tudo entregue! 🎉'}
        </div>
      ) : (
        <ul className="pend-list">
          {items.map((p) => (
            <li key={p.id} className={`card pend-card pend-card--${p.status}`}>
              <div className="pend-card__main">
                <div className="pend-card__info">
                  <span className={`pend-status pend-status--${p.status}`}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  <span className="pend-card__item">
                    {p.quantity}× {p.peripheralType}
                  </span>
                  <span className="pend-card__meta">
                    {p.endUserName ? `Para ${p.endUserName}` : 'Sem colaborador'}
                    {p.unitName ? ` · 📍 ${p.unitName}` : ''}
                    {p.motivo ? ` · ${p.motivo}` : ''}
                    {' · '}
                    {fmtDate(p.createdAt)}
                  </span>
                  {p.ticketId && (
                    <a
                      className="pend-card__ticket"
                      href={`https://unifique.acelerato.com/tickets/${p.ticketId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Chamado {p.ticketId} ↗
                    </a>
                  )}
                </div>

                {writable && p.status === 'PENDENTE' && (
                  <div className="pend-card__actions">
                    <button
                      className="btn accent"
                      onClick={() => resolve(p)}
                      disabled={busyId === p.id}
                    >
                      {busyId === p.id ? 'Entregando…' : 'Marcar entregue'}
                    </button>
                    <button
                      className="btn"
                      onClick={() => cancel(p)}
                      disabled={busyId === p.id}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
