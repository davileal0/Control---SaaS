import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AssignmentMovement, CATEGORY_LABEL } from '../types/domain';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import TicketRef from '../components/TicketRef';
import './movimentacoes.css';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Painel "Atribuições": qual ativo rastreável foi usado para qual chamado.
// Cada linha traz o ativo + o chamado (expansível, via TicketRef).
export default function AssignmentsPanel() {
  const toast = useToast();
  const [items, setItems] = useState<AssignmentMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getAssignmentMovements()
      .then(setItems)
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : 'Falha ao carregar.'),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <p className="panel-intro">
        Cada atribuição de um ativo rastreável (notebook, desktop, all-in-one,
        celular) a um chamado. Clique no chamado para ver os detalhes.
      </p>

      {loading ? (
        <div className="spinner-center">
          <Spinner size={28} />
          <span>Carregando…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="card mov-empty">
          Nenhuma atribuição com chamado registrada ainda.
        </div>
      ) : (
        <ul className="mov-list">
          {items.map((m) => (
            <li key={m.id} className="card mov-card">
              <div className="mov-card__asset">
                <span className="mov-card__model">{m.model}</span>
                <code className="mov-card__serial">{m.serialNumber}</code>
                <span className="mov-card__cat">
                  {CATEGORY_LABEL[m.category] ?? m.category}
                </span>
              </div>
              <div className="mov-card__meta">
                {m.endUserName ? `Para ${m.endUserName}` : 'Colaborador não informado'}
                {m.unitName ? ` · 📍 ${m.unitName}` : ''}
                {' · '}
                {fmtDate(m.timestamp)}
              </div>
              {m.ticketId && (
                <div className="mov-card__ticket">
                  <TicketRef ticketId={m.ticketId} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
