import { useEffect, useRef } from 'react';
import { ActivityFeedItem, MovementKind } from '../types/domain';
import Spinner from '../components/Spinner';
import './today-movements.css';

interface Props {
  items: ActivityFeedItem[];
  loading: boolean;
  onClose: () => void;
}

const KIND_LABEL: Record<MovementKind, string> = {
  ATRIBUICAO: 'Atribuição',
  DEVOLUCAO: 'Devolução',
  ENVIO_ASSISTENCIA: 'Envio à assistência',
  RETORNO_ASSISTENCIA: 'Retorno da assistência',
  INGESTAO: 'Entrada',
  OUTRO: 'Movimentação',
};

const REASON_LABEL: Record<string, string> = {
  AUMENTO_QUADRO: 'Aumento de quadro',
  SUBSTITUICAO: 'Substituição',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Painel de detalhes do card "Movimentações hoje": lista as movimentações
// do dia com tipo, observação, sub-categoria (intenção) e horário.
export default function TodayMovementsModal({ items, loading, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal glass today-mov"
        role="dialog"
        aria-modal="true"
        aria-label="Movimentações de hoje"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Hoje</span>
            <h2>
              Movimentações de hoje
              {!loading && items.length > 0 && (
                <span className="today-mov__count">{items.length}</span>
              )}
            </h2>
          </div>
          <button ref={closeRef} className="btn" onClick={onClose} type="button">
            Fechar
          </button>
        </header>

        <div className="today-mov__body">
          {loading ? (
            <div className="today-mov__loading">
              <Spinner size={22} />
              <span>Carregando…</span>
            </div>
          ) : items.length === 0 ? (
            <p className="today-mov__empty">
              Nenhuma movimentação registrada hoje.
            </p>
          ) : (
            <ul className="today-mov__list">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`today-mov__row ${item.isVoided ? 'is-voided' : ''}`}
                >
                  <div className="today-mov__line1">
                    <span
                      className={`today-mov__kind today-mov__kind--${item.kind}`}
                    >
                      {KIND_LABEL[item.kind]}
                    </span>
                    <span className="today-mov__asset">
                      {item.model}
                      <code>{item.serialNumber}</code>
                    </span>
                    <span className="today-mov__time">{fmtTime(item.timestamp)}</span>
                    {item.isVoided && (
                      <span className="today-mov__voided">anulada</span>
                    )}
                  </div>

                  {/* Sub-categoria/intenção (se houver) */}
                  {item.assignmentReasonDetail && (
                    <div className="today-mov__meta">
                      <span className="today-mov__meta-label">Sub-categoria:</span>{' '}
                      {item.assignmentReasonDetail}
                      {item.assignmentReason && REASON_LABEL[item.assignmentReason]
                        ? ` (${REASON_LABEL[item.assignmentReason]})`
                        : ''}
                    </div>
                  )}

                  {/* Observação informada (se houver) */}
                  {item.notes && (
                    <div className="today-mov__meta">
                      <span className="today-mov__meta-label">Observação:</span>{' '}
                      {item.notes}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
