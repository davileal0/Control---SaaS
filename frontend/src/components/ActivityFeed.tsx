import { useState, useEffect, useRef } from 'react';
import type { ActivityFeedItem, MovementKind } from '../types/domain';
import {
  PackageIcon,
  WrenchIcon,
  UserIcon,
  ActivityIcon,
} from './DashboardIcons';
import './activity-feed.css';

// =====================================================================
// ActivityFeed — feed de movimentações recentes (expansível)
// =====================================================================
// Cada item mostra uma linha-resumo (ícone do tipo + descrição + tempo
// relativo). Clicando, expande pra revelar os detalhes da movimentação:
// SN, modelo, chamado, setor, gestor, etc. Só mostra os campos que
// existem (movimentações diferentes preenchem campos diferentes).
//
// Sem autoria (pré-SSO) — mostra O QUE aconteceu, não QUEM fez.

// --- Metadados de apresentação por tipo de movimentação ---

const KIND_META: Record<
  MovementKind,
  { label: string; intent: 'assign' | 'return' | 'repair' | 'neutral'; verb: string }
> = {
  ATRIBUICAO: { label: 'Atribuição', intent: 'assign', verb: 'atribuído a' },
  DEVOLUCAO: { label: 'Devolução', intent: 'return', verb: 'devolvido ao estoque' },
  ENVIO_ASSISTENCIA: { label: 'Assistência', intent: 'repair', verb: 'enviado pra assistência' },
  RETORNO_ASSISTENCIA: { label: 'Retorno', intent: 'return', verb: 'retornou da assistência' },
  INGESTAO: { label: 'Entrada', intent: 'neutral', verb: 'adicionado ao estoque' },
  OUTRO: { label: 'Movimentação', intent: 'neutral', verb: 'movimentado' },
};

const ASSIGNMENT_REASON_LABEL: Record<string, string> = {
  AUMENTO_QUADRO: 'Aumento de quadro',
  SUBSTITUICAO: 'Substituição',
};

/** Ícone de histórico — caderno/documento com relógio sobreposto.
 *  Metáfora típica de "histórico de eventos ao longo do tempo". */
function HistoryIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Caderno/documento */}
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
      <path d="M9 7h5M9 11h3" />
      {/* Relógio sobreposto no canto inferior direito */}
      <circle cx="17.5" cy="15.5" r="4.5" />
      <path d="M17.5 13.6v2l1.3 1.3" />
    </svg>
  );
}

function KindIcon({ kind }: { kind: MovementKind }) {
  switch (kind) {
    case 'ATRIBUICAO':
      return <UserIcon size={16} />;
    case 'ENVIO_ASSISTENCIA':
    case 'RETORNO_ASSISTENCIA':
      return <WrenchIcon size={16} />;
    case 'INGESTAO':
      return <PackageIcon size={16} />;
    default:
      return <ActivityIcon size={16} />;
  }
}

/** Tempo relativo curto em PT-BR ("há 2h", "há 3d", "agora"). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60) return 'agora';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `há ${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `há ${diffDay}d`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `há ${diffMonth}mês${diffMonth > 1 ? 'es' : ''}`;
  const diffYear = Math.floor(diffMonth / 12);
  return `há ${diffYear}a`;
}

/** Data/hora absoluta pra tooltip e detalhe. */
function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Monta a descrição-resumo da movimentação. */
function buildSummary(item: ActivityFeedItem): string {
  const meta = KIND_META[item.kind];
  switch (item.kind) {
    case 'ATRIBUICAO':
      return item.endUserName
        ? `${item.model} → ${item.endUserName}`
        : `${item.model} ${meta.verb}`;
    case 'DEVOLUCAO':
      return `${item.model} devolvido`;
    case 'ENVIO_ASSISTENCIA':
      return `${item.model} → assistência`;
    case 'RETORNO_ASSISTENCIA':
      return `${item.model} retornou`;
    case 'INGESTAO':
      return `${item.model} adicionado`;
    default:
      return `${item.model} movimentado`;
  }
}

interface DetailRow {
  label: string;
  value: string;
}

/** Lista os campos preenchidos do item pra exibir no detalhe expandido. */
function buildDetails(item: ActivityFeedItem): DetailRow[] {
  const rows: DetailRow[] = [];
  rows.push({ label: 'Modelo', value: item.model });
  rows.push({ label: 'Nº de série', value: item.serialNumber });
  if (item.department) rows.push({ label: 'Setor', value: item.department });
  if (item.endUserName)
    rows.push({ label: 'Colaborador', value: item.endUserName });
  if (item.managerName) rows.push({ label: 'Gestor', value: item.managerName });
  if (item.ticketId) rows.push({ label: 'Chamado', value: `#${item.ticketId}` });
  if (item.assignmentReason)
    rows.push({
      label: 'Motivo',
      value:
        ASSIGNMENT_REASON_LABEL[item.assignmentReason] ?? item.assignmentReason,
    });
  if (item.invoiceNumber)
    rows.push({ label: 'Nota fiscal', value: item.invoiceNumber });
  if (item.trackingCode)
    rows.push({ label: 'Rastreio', value: item.trackingCode });
  if (item.notes) rows.push({ label: 'Observações', value: item.notes });
  rows.push({ label: 'Data', value: absoluteTime(item.timestamp) });
  return rows;
}

function FeedRow({ item }: { item: ActivityFeedItem }) {
  const [expanded, setExpanded] = useState(false);
  const meta = KIND_META[item.kind];
  const details = buildDetails(item);

  return (
    <li className={`feed-row ${item.isVoided ? 'feed-row--voided' : ''}`}>
      <button
        type="button"
        className="feed-row__head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={`feed-row__icon feed-row__icon--${meta.intent}`}>
          <KindIcon kind={item.kind} />
        </span>
        <span className="feed-row__summary">
          <span className="feed-row__text">{buildSummary(item)}</span>
          <span className="feed-row__meta">
            <span className={`feed-tag feed-tag--${meta.intent}`}>
              {meta.label}
            </span>
            {item.department && (
              <span className="feed-row__dept">{item.department}</span>
            )}
            {item.isVoided && <span className="feed-row__voided-tag">anulado</span>}
          </span>
        </span>
        <span className="feed-row__time" title={absoluteTime(item.timestamp)}>
          {relativeTime(item.timestamp)}
        </span>
        <span
          className={`feed-row__chevron ${expanded ? 'feed-row__chevron--open' : ''}`}
          aria-hidden="true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {expanded && (
        <div className="feed-row__detail">
          <dl className="feed-detail-grid">
            {details.map((d) => (
              <div key={d.label} className="feed-detail-item">
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </li>
  );
}

export interface ActivityFeedProps {
  items: ActivityFeedItem[];
  /** Callback do botão "Ver todas" (abre modal/página completa) */
  onSeeAll?: () => void;
  title?: string;
}

export default function ActivityFeed({
  items,
  onSeeAll,
  title = 'Movimentações recentes',
}: ActivityFeedProps) {
  return (
    <div className="activity-feed">
      <div className="activity-feed__header">
        <span className="activity-feed__title-wrap">
          <span className="activity-feed__title-icon">
            <HistoryIcon size={16} />
          </span>
          <span className="activity-feed__title">{title}</span>
        </span>
        {onSeeAll && (
          <button
            type="button"
            className="activity-feed__see-all"
            onClick={onSeeAll}
          >
            Ver todas →
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="activity-feed__empty">
          Nenhuma movimentação registrada ainda.
        </p>
      ) : (
        <ul className="activity-feed__list">
          {items.map((item) => (
            <FeedRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

// =====================================================================
// FullFeedModal — modal "Ver todas" (lista expandida do feed)
// =====================================================================

export interface FullFeedModalProps {
  items: ActivityFeedItem[];
  onClose: () => void;
}

export function FullFeedModal({ items, onClose }: FullFeedModalProps) {
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
        className="modal glass feed-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Todas as movimentações"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Histórico</span>
            <h2>Movimentações</h2>
          </div>
          <button ref={closeRef} className="btn" onClick={onClose}>
            Fechar
          </button>
        </header>

        <div className="feed-modal__body">
          {items.length === 0 ? (
            <p className="activity-feed__empty">
              Nenhuma movimentação registrada ainda.
            </p>
          ) : (
            <ul className="activity-feed__list">
              {items.map((item) => (
                <FeedRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
