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

// Agrupa pendências por chamado (mesmo chamado = 1 card). Sem chamado,
// agrupa por ativo+colaborador. Grupos com item PENDENTE vêm primeiro.
interface Group {
  key: string;
  ticketId: string | null;
  endUserName: string | null;
  unitName: string | null;
  createdAt: string;
  items: PeripheralPendency[];
}
function groupPendencies(items: PeripheralPendency[]): Group[] {
  const map = new Map<string, Group>();
  for (const p of items) {
    const key = p.ticketId
      ? `t:${p.ticketId}`
      : `x:${p.assetSerialNumber ?? '?'}|${p.endUserName ?? '?'}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        ticketId: p.ticketId,
        endUserName: p.endUserName,
        unitName: p.unitName,
        createdAt: p.createdAt,
        items: [],
      };
      map.set(key, g);
    }
    g.items.push(p);
    if (p.createdAt > g.createdAt) g.createdAt = p.createdAt;
  }
  const pend = (g: Group) => g.items.some((i) => i.status === 'PENDENTE');
  return [...map.values()].sort((a, b) => {
    if (pend(a) !== pend(b)) return pend(a) ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// Painel de Pendências: periféricos de chamados não entregues na
// atribuição. Um card por chamado, expansível; resolver dá baixa no
// estoque no momento da entrega. Usado como aba de "Movimentações".
export default function PendenciasPanel({ role }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<PeripheralPendency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
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

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function resolve(p: PeripheralPendency) {
    if (
      !window.confirm(
        `Entregar ${p.quantity}× ${p.peripheralType} agora? Isso dá baixa no estoque.`,
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

  const groups = groupPendencies(items);

  return (
    <>
      <p className="panel-intro">
        Periféricos solicitados em chamados que ainda não foram entregues. Ao
        resolver, a Control dá baixa no estoque no momento da entrega.
      </p>

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
      ) : groups.length === 0 ? (
        <div className="card pend-empty">
          {showAll
            ? 'Nenhuma pendência registrada.'
            : 'Nenhuma pendência aberta. Tudo entregue! 🎉'}
        </div>
      ) : (
        <ul className="pend-list">
          {groups.map((g) => {
            const pendentes = g.items.filter((i) => i.status === 'PENDENTE');
            const isOpen = open.has(g.key);
            return (
              <li key={g.key} className="card pend-group">
                <button
                  type="button"
                  className="pend-group__head"
                  onClick={() => toggle(g.key)}
                  aria-expanded={isOpen}
                >
                  <span className="pend-group__title">
                    {g.ticketId ? `Chamado ${g.ticketId}` : 'Sem chamado'}
                    {pendentes.length > 0 && (
                      <span className="pend-group__badge">
                        {pendentes.length} pendente{pendentes.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                  <span className="pend-group__sub">
                    {g.endUserName ? `Para ${g.endUserName}` : 'Sem colaborador'}
                    {g.unitName ? ` · 📍 ${g.unitName}` : ''}
                    {' · '}
                    {g.items.map((i) => i.peripheralType).join(', ')}
                  </span>
                  <span className="pend-group__caret">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <ul className="pend-items">
                    {g.items.map((p) => (
                      <li key={p.id} className="pend-item">
                        <div className="pend-item__info">
                          <span className={`pend-status pend-status--${p.status}`}>
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                          <span className="pend-item__name">
                            {p.quantity}× {p.peripheralType}
                          </span>
                          <span className="pend-item__meta">
                            {p.motivo ? `${p.motivo} · ` : ''}
                            {fmtDate(p.createdAt)}
                            {p.status !== 'PENDENTE' && p.resolvedByName
                              ? ` · por ${p.resolvedByName}`
                              : ''}
                          </span>
                        </div>
                        {writable && p.status === 'PENDENTE' && (
                          <div className="pend-item__actions">
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
                      </li>
                    ))}

                    {g.ticketId && (
                      <li className="pend-items__foot">
                        <a
                          href={`https://unifique.acelerato.com/tickets/${g.ticketId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir chamado {g.ticketId} no Acelerato ↗
                        </a>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
