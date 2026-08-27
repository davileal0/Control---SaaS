import { useState } from 'react';
import { api, AceleratoTicket } from '../lib/api';
import './ticket-ref.css';

interface Props {
  ticketId: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Referência a um chamado do Acelerato. Mostra o número; ao clicar,
// busca (sob demanda) e expande os detalhes do chamado. A busca é lazy
// de propósito — não convém consultar a API do Acelerato pra cada
// lançamento da timeline de uma vez (risco de rate limit).
export default function TicketRef({ ticketId }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AceleratoTicket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) {
      setLoading(true);
      setError(null);
      api
        .aceleratoTicket(ticketId)
        .then(setData)
        .catch((e) =>
          setError(e instanceof Error ? e.message : 'Falha ao buscar o chamado.'),
        )
        .finally(() => setLoading(false));
    }
  }

  return (
    <span className="ticket-ref">
      <button
        type="button"
        className="ticket-ref__btn"
        onClick={toggle}
        aria-expanded={open}
      >
        Chamado {ticketId} <span className="ticket-ref__caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="ticket-ref__card">
          {loading && <p className="ticket-ref__muted">Buscando no Acelerato…</p>}
          {error && <p className="ticket-ref__error">{error}</p>}
          {data && (
            <>
              <div className="ticket-ref__head">
                <span className="ticket-ref__title">{data.titulo || 'Sem título'}</span>
                {data.status && (
                  <span
                    className={`ticket-ref__status ${data.finalizado ? 'is-done' : ''}`}
                  >
                    {data.status}
                  </span>
                )}
              </div>
              <dl className="ticket-ref__grid">
                {data.solicitante && (
                  <>
                    <dt>Solicitante</dt>
                    <dd>{data.solicitante}</dd>
                  </>
                )}
                {data.agente && (
                  <>
                    <dt>Agente</dt>
                    <dd>{data.agente}</dd>
                  </>
                )}
                {data.equipe && (
                  <>
                    <dt>Equipe</dt>
                    <dd>{data.equipe}</dd>
                  </>
                )}
                {data.prioridade && (
                  <>
                    <dt>Prioridade</dt>
                    <dd>{data.prioridade}</dd>
                  </>
                )}
                <dt>Aberto em</dt>
                <dd>{fmtDate(data.criadoEm)}</dd>
                <dt>Atualizado</dt>
                <dd>{fmtDate(data.atualizadoEm)}</dd>
              </dl>
              {data.url && (
                <a
                  className="ticket-ref__link"
                  href={data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir no Acelerato ↗
                </a>
              )}
            </>
          )}
        </div>
      )}
    </span>
  );
}
