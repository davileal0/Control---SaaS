import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import {
  PurchaseRequest,
  PurchaseRequestStatus,
  PR_STATUS_LABEL,
  PR_CLOSE_REASON_LABEL,
  ROLE_LABEL,
  Role,
} from '../types/domain';
import {
  canAuthorizePurchaseRequest,
  canOpenPurchaseRequest,
  canClosePurchaseRequest,
  canCancelPurchaseRequest,
} from '../lib/rbac';
import Spinner from '../components/Spinner';
import AuthorizePurchaseRequestModal from './AuthorizePurchaseRequestModal';
import OpenPurchaseRequestModal from './OpenPurchaseRequestModal';
import ClosePurchaseRequestModal from './ClosePurchaseRequestModal';
import './purchase-requests.css';

// =====================================================================
// Página: Solicitações de Compra
// =====================================================================
// Visível pra todos os papéis (transparência operacional). Ações são
// gated por papel — o operador vê tudo mas só atua no que pode:
//   - Heryck (Operador N1): abrir + fechar (com confirmação dupla)
//   - Líder/Diretor: autorizar + abrir + fechar + cancelar
//
// Layout: lista de cards por SC, filtros no topo, botão "+ Nova SC"
// no header (gated por canAuthorize).

type StatusFilter = 'all' | PurchaseRequestStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'AGUARDANDO_ABERTURA', label: 'Aguardando abertura' },
  { key: 'ABERTA', label: 'Em compra' },
  { key: 'FECHADA', label: 'Fechadas' },
  { key: 'CANCELADA', label: 'Canceladas' },
];

interface Props {
  role: Role | null;
}

export default function PurchaseRequests({ role }: Props) {
  const toast = useToast();

  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  // Modal state — apenas um aberto por vez
  const [openAuthorize, setOpenAuthorize] = useState(false);
  const [openOpenModal, setOpenOpenModal] = useState<PurchaseRequest | null>(null);
  const [openCloseModal, setOpenCloseModal] = useState<{
    pr: PurchaseRequest;
    reason: 'MANUAL' | 'CANCELED';
  } | null>(null);

  async function load() {
    try {
      setLoading(true);
      const data = await api.listPurchaseRequests();
      setRequests(data);
    } catch (err) {
      toast.error('Não foi possível carregar as solicitações.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Filtros aplicados no client (lista é pequena no MVP — algumas dezenas
  // de SCs no histórico). Se crescer muito, migra pra backend.
  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay =
          r.targetValue.toLowerCase() +
          ' ' +
          (r.scNumber ?? '').toLowerCase() +
          ' ' +
          r.authorizedByName.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, statusFilter, search]);

  // Contadores pros chips do filtro (sempre baseados na lista total)
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: requests.length,
      AGUARDANDO_ABERTURA: 0,
      ABERTA: 0,
      FECHADA: 0,
      CANCELADA: 0,
    };
    requests.forEach((r) => {
      c[r.status]++;
    });
    return c;
  }, [requests]);

  if (!role) return null;
  const canAuthorize = canAuthorizePurchaseRequest(role);

  return (
    <section className="pr-page page-fade-in">
      <header className="pr-page__head">
        <div>
          <span className="eyebrow">Compras em andamento e histórico</span>
          <h1>Solicitações de Compra</h1>
        </div>
        {canAuthorize && (
          <button
            className="btn primary"
            onClick={() => setOpenAuthorize(true)}
          >
            + Nova SC
          </button>
        )}
      </header>

      <div className="pr-filters">
        <div className="pr-filters__chips">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`pr-chip ${statusFilter === f.key ? 'pr-chip--active' : ''}`}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
              <span className="pr-chip__count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className="field pr-filters__search"
          placeholder="Buscar por alvo, número da SC ou autor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="pr-loading">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="pr-empty">
          {requests.length === 0
            ? 'Nenhuma SC registrada ainda. Quando o estoque cair abaixo do crítico, a primeira aparece aqui.'
            : 'Nenhuma SC corresponde aos filtros atuais.'}
        </div>
      ) : (
        <ul className="pr-list">
          {filtered.map((pr) => (
            <PurchaseRequestCard
              key={pr.id}
              pr={pr}
              currentRole={role}
              onOpenClick={() => setOpenOpenModal(pr)}
              onCloseClick={(reason) => setOpenCloseModal({ pr, reason })}
            />
          ))}
        </ul>
      )}

      {openAuthorize && (
        <AuthorizePurchaseRequestModal
          onClose={() => setOpenAuthorize(false)}
          onCreated={() => {
            setOpenAuthorize(false);
            load();
          }}
        />
      )}
      {openOpenModal && (
        <OpenPurchaseRequestModal
          request={openOpenModal}
          onClose={() => setOpenOpenModal(null)}
          onOpened={() => {
            setOpenOpenModal(null);
            load();
          }}
        />
      )}
      {openCloseModal && (
        <ClosePurchaseRequestModal
          request={openCloseModal.pr}
          reason={openCloseModal.reason}
          onClose={() => setOpenCloseModal(null)}
          onClosed={() => {
            setOpenCloseModal(null);
            load();
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Card individual de SC — mostra cabeçalho + timeline + ações
// ---------------------------------------------------------------------
interface CardProps {
  pr: PurchaseRequest;
  currentRole: Role;
  onOpenClick: () => void;
  onCloseClick: (reason: 'MANUAL' | 'CANCELED') => void;
}

function PurchaseRequestCard({
  pr,
  currentRole,
  onOpenClick,
  onCloseClick,
}: CardProps) {
  const isActive = pr.status === 'AGUARDANDO_ABERTURA' || pr.status === 'ABERTA';
  const canOpen = canOpenPurchaseRequest(currentRole);
  const canClose = canClosePurchaseRequest(currentRole);
  const canCancel = canCancelPurchaseRequest(currentRole);

  return (
    <li className={`pr-card pr-card--${pr.status}`}>
      <div className="pr-card__head">
        <div className="pr-card__title">
          <span className="pr-card__kind">
            {pr.targetKind === 'CATEGORY' ? 'Categoria' : 'Periférico'}
          </span>
          <h3>
            {pr.targetValue}
            <span className="pr-card__quantity">
              · {pr.quantity} {pr.quantity === 1 ? 'unidade' : 'unidades'}
            </span>
          </h3>
        </div>
        <span className={`pr-status pr-status--${pr.status}`}>
          {PR_STATUS_LABEL[pr.status]}
        </span>
      </div>

      {pr.scNumber && (
        <div className="pr-card__sc-number">
          SC nº <code>{pr.scNumber}</code>
        </div>
      )}

      <dl className="pr-card__timeline">
        <div>
          <dt>Autorizado por</dt>
          <dd>
            {pr.authorizedByName}{' '}
            <span className="pr-card__role">
              ({ROLE_LABEL[pr.authorizedByRole]})
            </span>
            <br />
            <time className="pr-card__time">
              {new Date(pr.authorizedAt).toLocaleString('pt-BR')}
            </time>
          </dd>
        </div>
        {pr.openedAt && (
          <div>
            <dt>Aberta por</dt>
            <dd>
              {pr.openedByName}{' '}
              {pr.openedByRole && (
                <span className="pr-card__role">
                  ({ROLE_LABEL[pr.openedByRole]})
                </span>
              )}
              <br />
              <time className="pr-card__time">
                {new Date(pr.openedAt).toLocaleString('pt-BR')}
              </time>
            </dd>
          </div>
        )}
        {pr.closedAt && (
          <div>
            <dt>{pr.status === 'CANCELADA' ? 'Cancelada por' : 'Fechada por'}</dt>
            <dd>
              {pr.closedByName ?? <em>(auto — estoque normalizou)</em>}
              {pr.closedByRole && (
                <span className="pr-card__role">
                  {' '}
                  ({ROLE_LABEL[pr.closedByRole]})
                </span>
              )}
              <br />
              <time className="pr-card__time">
                {new Date(pr.closedAt).toLocaleString('pt-BR')}
              </time>
              {pr.closeReason && (
                <div className="pr-card__close-reason">
                  Motivo: {PR_CLOSE_REASON_LABEL[pr.closeReason]}
                </div>
              )}
            </dd>
          </div>
        )}
      </dl>

      {pr.notes && (
        <div className="pr-card__notes">
          <span className="pr-card__notes-label">Observações</span>
          <p>{pr.notes}</p>
        </div>
      )}

      {isActive && (canOpen || canClose) && (
        <footer className="pr-card__actions">
          {pr.status === 'AGUARDANDO_ABERTURA' && canOpen && (
            <button className="btn primary" onClick={onOpenClick}>
              Marcar como aberta
            </button>
          )}
          {canClose && (
            <button
              className="btn"
              onClick={() => onCloseClick('MANUAL')}
              title="Confirmar recebimento ou fechar manualmente"
            >
              Fechar SC
            </button>
          )}
          {canCancel && pr.status === 'AGUARDANDO_ABERTURA' && (
            <button
              className="btn warning"
              onClick={() => onCloseClick('CANCELED')}
              title="Cancelar SC autorizada por engano"
            >
              Cancelar
            </button>
          )}
        </footer>
      )}
    </li>
  );
}
