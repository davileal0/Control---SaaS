import { useEffect, useState } from 'react';
import {
  api,
  OperatorActivitySummary,
  OperatorActivityDetail,
  ActivityActionType,
} from '../lib/api';
import './activity.css';

// Painel de Atividade dos Operadores (Líder/Coordenador).
// Apoio pra feedback individual baseado em evidência — NÃO é ranking.
// Ordena por nome, mostra os fatos (contagem por tipo, última atividade,
// mini-gráfico), e permite abrir o extrato de cada operador.

const ACTION_LABEL: Record<ActivityActionType, string> = {
  cadastro: 'Cadastros',
  atribuicao: 'Atribuições',
  devolucao: 'Devoluções',
  descarte: 'Descartes',
  outro: 'Outras',
};

// Presets de período (em dias). O painel sempre olha uma janela recente.
const PERIODS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Sparkline SVG — sem animação de movimento (respeita reduced-motion e
// a sensibilidade vestibular). Só barras estáticas proporcionais.
function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) {
    return <span className="activity-spark activity-spark--empty">sem dados</span>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  const W = 120;
  const H = 28;
  const gap = 2;
  const barW = Math.max((W - gap * (data.length - 1)) / data.length, 1);
  return (
    <svg
      className="activity-spark"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`Atividade ao longo de ${data.length} dia(s)`}
    >
      {data.map((d, i) => {
        const h = Math.max((d.count / max) * H, 2);
        return (
          <rect
            key={d.date}
            x={i * (barW + gap)}
            y={H - h}
            width={barW}
            height={h}
            rx={1}
            className="activity-spark__bar"
          />
        );
      })}
    </svg>
  );
}

export default function Activity() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<OperatorActivitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Operador selecionado pro extrato (drawer/detalhe)
  const [selected, setSelected] = useState<OperatorActivitySummary | null>(null);
  const [detail, setDetail] = useState<OperatorActivityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - days);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .getTeamActivity(isoDate(periodStart), isoDate(periodEnd))
      .then((data) => {
        if (alive) setRows(data);
      })
      .catch((e) => {
        if (alive) setError(e.message ?? 'Falha ao carregar atividade.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  function openOperator(op: OperatorActivitySummary) {
    setSelected(op);
    setDetail(null);
    setDetailLoading(true);
    api
      .getOperatorActivity(op.actorUserId, isoDate(periodStart), isoDate(periodEnd))
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }

  function closeDetail() {
    setSelected(null);
    setDetail(null);
  }

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Gestão de equipe</span>
        <h1>Atividade dos operadores</h1>
        <p>
          Visão de apoio para acompanhar como a equipe usa a plataforma e
          conduzir conversas de feedback com base em fatos. Não é ranking:
          os operadores aparecem em ordem alfabética.
        </p>
      </div>

      <div className="activity-toolbar">
        <div className="activity-period" role="group" aria-label="Período">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              className={`activity-period__chip ${
                p.days === days ? 'activity-period__chip--on' : ''
              }`}
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="activity-error">{error}</div>}

      {loading ? (
        <div className="activity-empty card">Carregando atividade…</div>
      ) : rows.length === 0 ? (
        <div className="activity-empty card">
          Nenhuma atividade registrada no período. Ações feitas a partir de
          agora aparecem aqui — registros antigos, anteriores à captura de
          autoria, não têm operador associado.
        </div>
      ) : (
        <div className="activity-grid">
          {rows.map((op) => (
            <article key={op.actorUserId} className="activity-card card">
              <header className="activity-card__head">
                <div>
                  <h2 className="activity-card__name">{op.actorName}</h2>
                  <span className="activity-card__role">{op.actorRole}</span>
                </div>
                <div className="activity-card__total">
                  <strong>{op.total}</strong>
                  <span>ações</span>
                </div>
              </header>

              <Sparkline data={op.dailyCounts} />

              <ul className="activity-card__types">
                {(Object.keys(ACTION_LABEL) as ActivityActionType[])
                  .filter((t) => op.byType[t] > 0)
                  .map((t) => (
                    <li key={t}>
                      <span className="activity-card__type-count">
                        {op.byType[t]}
                      </span>
                      {ACTION_LABEL[t]}
                    </li>
                  ))}
              </ul>

              <footer className="activity-card__foot">
                <span className="activity-card__last">
                  Última atividade: {fmtDateTime(op.lastActivity)}
                </span>
                <button
                  className="btn"
                  onClick={() => openOperator(op)}
                >
                  Ver extrato
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="activity-drawer-backdrop"
          onClick={closeDetail}
          role="presentation"
        >
          <aside
            className="activity-drawer glass"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Extrato de ${selected.actorName}`}
          >
            <header className="activity-drawer__head">
              <div>
                <span className="eyebrow">Extrato individual</span>
                <h2>{selected.actorName}</h2>
                <span className="activity-drawer__role">
                  {selected.actorRole}
                </span>
              </div>
              <button className="btn" onClick={closeDetail}>
                Fechar
              </button>
            </header>

            {detailLoading ? (
              <div className="activity-empty">Carregando extrato…</div>
            ) : !detail || detail.entries.length === 0 ? (
              <div className="activity-empty">
                Nenhuma ação neste período.
              </div>
            ) : (
              <ul className="activity-timeline">
                {detail.entries.map((e) => (
                  <li key={e.id} className="activity-timeline__item">
                    <span
                      className={`activity-tag activity-tag--${e.type}`}
                    >
                      {ACTION_LABEL[e.type]}
                    </span>
                    <div className="activity-timeline__body">
                      <span className="activity-timeline__asset">
                        {e.assetSerialNumber}
                        {e.endUserName ? ` · ${e.endUserName}` : ''}
                      </span>
                      <span className="activity-timeline__time">
                        {fmtDateTime(e.timestamp)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
