import { useState, useEffect, useCallback } from 'react';
import Donut from '../components/Donut';
import Spinner from '../components/Spinner';
import Sparkline from '../components/Sparkline';
import PeripheralsModal from './PeripheralsModal';
import TodayMovementsModal from './TodayMovementsModal';
import ActivityFeed, { FullFeedModal } from '../components/ActivityFeed';
import {
  IconKPI,
  HeroCard,
  HeroNextAction,
} from '../components/KpiCards';
import { useDashboard } from '../lib/useDashboard';
import { LOW_STOCK_THRESHOLD } from '../lib/constants';
import {
  NotebookIcon,
  PhoneIcon,
  MonitorIcon,
  MouseIcon,
  CheckCircleIcon,
} from '../components/icons';
import {
  PackageIcon,
  WrenchIcon,
  AlertIcon,
  ActivityIcon,
  ShoppingBagIcon,
  UserIcon,
  ClockIcon,
  ChartIcon,
  BriefcaseIcon,
  BellIcon,
} from '../components/DashboardIcons';
import { CategoryStats, api } from '../lib/api';
import {
  Role,
  OperatorMetrics,
  LeaderMetrics,
  DirectorMetrics,
  PeripheralProjection,
  ActivityFeedItem,
  AssignmentReasonsSummary,
} from '../types/domain';
import './dashboard.css';

interface DashboardProps {
  role: Role | null;
  /** Callback opcional pra navegar pra outra página (sidebar) */
  onNavigate?: (key: string) => void;
}

// Categorias filtráveis no donut "Visão de Compras"
type DonutCategory = 'Notebook' | 'Celular' | 'AllInOne' | 'Periferico';
const DONUT_OPTIONS: { key: DonutCategory; label: string }[] = [
  { key: 'Notebook', label: 'Notebook' },
  { key: 'Celular', label: 'Celular' },
  { key: 'AllInOne', label: 'All-in-One' },
  { key: 'Periferico', label: 'Periférico' },
];

export default function Dashboard({ role, onNavigate }: DashboardProps) {
  const { metrics, peripherals, usingSample, loading, refresh } = useDashboard();
  const [showPeripherals, setShowPeripherals] = useState(false);
  const [donutCategory, setDonutCategory] = useState<DonutCategory>('Notebook');

  // KPIs por papel — carrega o pacote correspondente ao role atual
  const [opMetrics, setOpMetrics] = useState<OperatorMetrics | null>(null);
  const [lMetrics, setLMetrics] = useState<LeaderMetrics | null>(null);
  const [dMetrics, setDMetrics] = useState<DirectorMetrics | null>(null);

  // Feed de movimentações recentes — comum a todos os papéis (P3).
  // Carrega as últimas 6 pro card; "Ver todas" abre modal com mais.
  const [feed, setFeed] = useState<ActivityFeedItem[]>([]);
  const [showAllFeed, setShowAllFeed] = useState(false);
  const [fullFeed, setFullFeed] = useState<ActivityFeedItem[]>([]);

  // Busca o pacote de KPIs do papel atual (sem zerar o estado antes —
  // assim um refresh não pisca o spinner da seção).
  const loadRoleMetrics = useCallback(() => {
    if (role === 'OPERADOR_N1') {
      api.getOperatorMetrics().then(setOpMetrics).catch(() => {});
    } else if (role === 'LIDER_N1') {
      api.getLeaderMetrics().then(setLMetrics).catch(() => {});
    } else if (role === 'DIRETOR_TI') {
      api.getDirectorMetrics().then(setDMetrics).catch(() => {});
    }
  }, [role]);

  const loadFeed = useCallback(() => {
    api.getActivityFeed(6).then(setFeed).catch(() => {});
  }, []);

  useEffect(() => {
    if (!role) return;
    // Reset ao trocar de papel (ex: "Visualizar como" do dev)
    setOpMetrics(null);
    setLMetrics(null);
    setDMetrics(null);
    loadRoleMetrics();
  }, [role, loadRoleMetrics]);

  // Feed independe do papel — carrega ao montar
  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Auto-refresh: ao voltar o foco pra janela/aba, recarrega métricas e
  // feed. Cobre o caso de fazer uma movimentação em outra aba/app e
  // voltar pro dashboard sem dar F5. (Navegar entre abas internas já
  // remonta o componente e recarrega por si.)
  useEffect(() => {
    const onFocus = () => {
      refresh();
      loadRoleMetrics();
      loadFeed();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, loadRoleMetrics, loadFeed]);

  // Abre o modal "Ver todas" carregando um lote maior (50)
  const handleSeeAllFeed = () => {
    api
      .getActivityFeed(50)
      .then((items) => {
        setFullFeed(items);
        setShowAllFeed(true);
      })
      .catch(() => {
        // fallback: mostra o que já tem
        setFullFeed(feed);
        setShowAllFeed(true);
      });
  };

  if (loading || !metrics || !peripherals) {
    return (
      <div className="spinner-center">
        <Spinner size={28} />
        <span>Carregando métricas…</span>
      </div>
    );
  }

  // Periféricos REALMENTE com estoque baixo (<= threshold). Antes pegava
  // os 3 menores SEM filtrar, então apareciam itens com 31/50 un (acima
  // do limite de 25). Agora filtra primeiro pelo threshold, depois ordena
  // e corta os 3 mais críticos. Lista vazia = estoque saudável.
  // Princípio operacional: "alertas > vaidade estatística".
  const lowStock = [...peripherals.items]
    .filter((p) => p.available <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.available - b.available)
    .slice(0, 3);

  // Quantos no total estão abaixo do limite (pra decidir success vs alertas)
  const lowStockTotal = peripherals.items.filter(
    (p) => p.available <= LOW_STOCK_THRESHOLD,
  ).length;
  const hasLowStock = lowStockTotal > 0;

  // Stats que alimentam o donut, baseado na categoria selecionada
  // Stats que alimentam o donut, sempre por categoria específica
  // (removido o "Todos" que somava categorias incompatíveis).
  const donutStats: CategoryStats = metrics.byCategory[donutCategory];

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Infraestrutura N1</span>
        <h1>Dashboard</h1>
        <p>
          Inventário ativo em tempo real.
          {usingSample && ' (exibindo dados de exemplo — API offline)'}
        </p>
      </div>

      {/* SEÇÃO 1: KPIs por papel — varia conforme role atual.
          Operador: foco em tarefas operacionais do dia.
          Líder:    visão de equipe + métricas calculadas pra reporting.
          Diretor:  visão estratégica + atalhos pra justificativas. */}
      {role === 'OPERADOR_N1' && (
        <OperatorSection
          opMetrics={opMetrics}
          peripheralsLowStockCount={
            peripherals.items.filter((p) => p.available <= LOW_STOCK_THRESHOLD).length
          }
          onNavigatePR={() => onNavigate?.('purchase-requests')}
          onOpenPeripherals={() => setShowPeripherals(true)}
        />
      )}
      {role === 'LIDER_N1' && (
        <LeaderSection
          lMetrics={lMetrics}
          onNavigatePR={() => onNavigate?.('purchase-requests')}
        />
      )}
      {role === 'DIRETOR_TI' && (
        <DirectorSection
          dMetrics={dMetrics}
          onNavigatePR={() => onNavigate?.('purchase-requests')}
          onNavigateReports={() => onNavigate?.('reports')}
        />
      )}

      {/* LINHA 2: visão de compras filtrável + top 3 estoque crítico */}
      <div className="grid cols-2">
        <div className="card distribution-card">
          <span className="eyebrow">Visão de compras — distribuição de estoque</span>
          <div className="category-selector">
            {DONUT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`category-selector__pill ${donutCategory === opt.key ? 'is-active' : ''}`}
                onClick={() => setDonutCategory(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <Donut
              slices={[
                { label: 'Disponível', value: donutStats.Disponivel, color: '#4a82d6' },
                { label: 'Em Uso', value: donutStats.EmUso, color: 'var(--led)' },
                { label: 'Danificado', value: donutStats.Danificado, color: '#3a3f49' },
              ]}
            />
          </div>
        </div>

        {/* Periféricos com estoque baixo — 2 estados:
            - COM alertas: lista clicável (abre modal com todos)
            - SEM alertas: estado de sucesso (estoque saudável)
            Quando não há alertas, o card não é botão (nada a abrir). */}
        {hasLowStock ? (
          <button
            type="button"
            className="card low-stock-widget"
            onClick={() => setShowPeripherals(true)}
            aria-haspopup="dialog"
          >
            <span className="eyebrow">Periféricos com estoque baixo</span>
            <ul className="low-stock-list">
              {lowStock.map((item) => {
                const isAlert = item.available <= LOW_STOCK_THRESHOLD;
                return (
                  <li
                    key={item.model}
                    className={`low-stock-item ${isAlert ? 'is-alert' : ''}`}
                  >
                    <span className="low-stock-item__icon" aria-hidden>
                      <MouseIcon size={16} />
                    </span>
                    <span className="low-stock-item__model">{item.model}</span>
                    <span className="low-stock-item__count">{item.available}</span>
                    {isAlert && (
                      <span
                        className="low-stock-item__alert"
                        aria-label="Estoque crítico — abrir SA pra reposição"
                        title="Estoque crítico"
                      >
                        <AlertIcon size={14} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <span className="low-stock-cta">Ver todos os tipos →</span>
          </button>
        ) : (
          <div className="card low-stock-widget low-stock-widget--healthy">
            <span className="eyebrow">Periféricos com estoque baixo</span>
            <div className="low-stock-success">
              <span className="low-stock-success__icon" aria-hidden>
                <CheckCircleIcon size={32} />
              </span>
              <span className="low-stock-success__title">Estoque saudável</span>
              <span className="low-stock-success__sub">
                Nenhum periférico abaixo de {LOW_STOCK_THRESHOLD} unidades.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* LINHA 3: feed de movimentações recentes — comum a todos (P2/P3).
          Substitui o antigo "Presos em assistência". */}
      <div className="dashboard-feed-row">
        <ActivityFeed items={feed} onSeeAll={handleSeeAllFeed} />
      </div>

      {showPeripherals && (
        <PeripheralsModal
          data={peripherals}
          onClose={() => setShowPeripherals(false)}
        />
      )}

      {showAllFeed && (
        <FullFeedModal
          items={fullFeed}
          onClose={() => setShowAllFeed(false)}
        />
      )}
    </>
  );
}

// ---------- Sub-componentes ----------

// =====================================================================
// Sub-seções por papel — KPIs operacionais
// =====================================================================

interface OperatorSectionProps {
  opMetrics: OperatorMetrics | null;
  peripheralsLowStockCount: number;
  onNavigatePR: () => void;
  // Abre o painel "Periféricos com estoque baixo" (mesmo modal do card
  // da linha 2). Só é acionado quando há itens críticos.
  onOpenPeripherals: () => void;
}

// ---------------------------------------------------------------------
// Helpers compartilhados pelas 3 sections
// ---------------------------------------------------------------------

/** Ícone por categoria de equipamento — usado no HeroCard pra dar
 *  contexto visual na visão geral. */
const HERO_ICON_FOR_CATEGORY = {
  Notebook: <NotebookIcon size={18} />,
  Desktop: <MonitorIcon size={18} />,
  Celular: <PhoneIcon size={18} />,
  AllInOne: <MonitorIcon size={18} />,
} as const;

/** Projeções → actions do HeroCard (top 3 mais urgentes) */
function projectionsToActions(p: PeripheralProjection[]): HeroNextAction[] {
  return p.slice(0, 3).map((proj) => ({
    model: proj.model,
    currentStock: proj.currentStock,
    daysRemaining: proj.daysRemaining,
  }));
}

/** Calcula o chip de saúde geral baseado em alertas ativos.
 *  Lógica: se há periféricos com daysRemaining ≤ 7 → critical (vermelho)
 *  Se há periféricos com daysRemaining ≤ 14 → warning (amarelo)
 *  Caso contrário → ok (verde) */
function buildHealthChip(
  projections: PeripheralProjection[],
): { label: string; intent: 'ok' | 'warning' | 'critical' } {
  const urgent = projections.filter(
    (p) => p.daysRemaining !== null && p.daysRemaining <= 7,
  );
  if (urgent.length > 0) {
    return {
      label: `${urgent.length} crítico${urgent.length === 1 ? '' : 's'}`,
      intent: 'critical',
    };
  }
  const warning = projections.filter(
    (p) => p.daysRemaining !== null && p.daysRemaining <= 14,
  );
  if (warning.length > 0) {
    return {
      label: `${warning.length} alerta${warning.length === 1 ? '' : 's'}`,
      intent: 'warning',
    };
  }
  return { label: 'Tudo em ordem', intent: 'ok' };
}

/** Subtítulo do card "Atribuições no mês", com destaque da principal
 *  intenção (sub-categoria) do período quando houver. */
function assignmentsSubtitle(ar: AssignmentReasonsSummary): string {
  if (ar.total === 0) return 'Sem atribuições neste mês';
  const base =
    `${ar.aumentoQuadro} aumento${ar.aumentoQuadro === 1 ? '' : 's'} · ` +
    `${ar.substituicao} substituiç${ar.substituicao === 1 ? 'ão' : 'ões'}`;
  const top = ar.topIntents[0];
  return top ? `${base} · destaque: ${top.detail} (${top.count})` : base;
}

/** Movs hoje vs MÉDIA dos 6 dias anteriores. Retorna delta inteiro. */
function calcMovementsDelta(sparkline: number[]): number {
  if (sparkline.length < 2) return 0;
  const today = sparkline[sparkline.length - 1];
  const previous = sparkline.slice(0, -1);
  const avg = previous.reduce((a, b) => a + b, 0) / previous.length;
  return Math.round(today - avg);
}

function OperatorSection({
  opMetrics,
  peripheralsLowStockCount,
  onNavigatePR,
  onOpenPeripherals,
}: OperatorSectionProps) {
  // Painel de detalhe do card "Movimentações hoje" (carrega ao abrir).
  // Hooks ficam ANTES de qualquer return condicional (regras de hooks).
  const [showToday, setShowToday] = useState(false);
  const [todayItems, setTodayItems] = useState<ActivityFeedItem[]>([]);
  const [loadingToday, setLoadingToday] = useState(false);

  function openTodayMovements() {
    setShowToday(true);
    setLoadingToday(true);
    api
      .getTodayMovements()
      .then(setTodayItems)
      .catch(() => setTodayItems([]))
      .finally(() => setLoadingToday(false));
  }

  if (!opMetrics) {
    return (
      <div className="kpi-grid">
        <div className="metric-card"><Spinner size={20} /></div>
      </div>
    );
  }
  const pr = opMetrics.activePurchaseRequests;
  const movDelta = calcMovementsDelta(opMetrics.movementsSparkline7d);

  return (
    <section aria-label="KPIs do operador" className="dashboard-section">
      {/* HERO: estado do estoque + próxima ação sugerida */}
      <HeroCard
        icon={<PackageIcon size={20} />}
        title="Estado do estoque"
        subtitle="Visão em tempo real"
        healthChip={buildHealthChip(opMetrics.peripheralProjections)}
        equipments={opMetrics.equipmentsOverview}
        peripherals={opMetrics.peripheralsOverview}
        nextActions={projectionsToActions(opMetrics.peripheralProjections)}
        bellIcon={<BellIcon size={16} />}
        iconForCategory={HERO_ICON_FOR_CATEGORY}
        peripheralIcon={<MouseIcon size={16} />}
      />

      {/* KPIs secundários — 4 cards com ícone colorido */}
      <div className="kpi-grid kpi-grid--icons">
        <IconKPI
          icon={<AlertIcon />}
          iconColor="var(--led)"
          label="Estoque crítico"
          value={peripheralsLowStockCount}
          subtitle={
            peripheralsLowStockCount === 0
              ? 'Nenhum tipo abaixo do limite'
              : `${peripheralsLowStockCount} tipo${peripheralsLowStockCount === 1 ? '' : 's'} de periférico baixo`
          }
          // Clicável só quando há itens críticos — abre o painel de
          // periféricos com estoque baixo (mesmo do card da linha 2).
          onClick={
            peripheralsLowStockCount > 0 ? onOpenPeripherals : undefined
          }
        />
        <IconKPI
          icon={<WrenchIcon />}
          iconColor="#d8b15a"
          label="Em assistência"
          value={opMetrics.inRepair}
          subtitle={opMetrics.inRepair === 0 ? 'Nada em reparo' : 'Ativos em Spectra'}
        />
        <IconKPI
          icon={<ActivityIcon />}
          iconColor="#4a82d6"
          label="Movimentações hoje"
          value={opMetrics.movementsToday}
          delta={movDelta}
          subtitle={
            opMetrics.movementsToday === 0
              ? 'Sem registros hoje'
              : 'Ver detalhes do dia'
          }
          onClick={openTodayMovements}
          trailing={
            <Sparkline
              data={opMetrics.movementsSparkline7d}
              color="#4a82d6"
              width={68}
              height={24}
            />
          }
        />
        <IconKPI
          icon={<ShoppingBagIcon />}
          iconColor="#4a82d6"
          label="Solicitações de compra"
          value={pr.total}
          subtitle={
            pr.total === 0
              ? 'Nenhuma em curso'
              : `${pr.aguardando} aguardando · ${pr.aberta} em compra`
          }
          onClick={onNavigatePR}
        />
      </div>

      {showToday && (
        <TodayMovementsModal
          items={todayItems}
          loading={loadingToday}
          onClose={() => setShowToday(false)}
        />
      )}
    </section>
  );
}

interface LeaderSectionProps {
  lMetrics: LeaderMetrics | null;
  onNavigatePR: () => void;
}

function LeaderSection({ lMetrics, onNavigatePR }: LeaderSectionProps) {
  if (!lMetrics) {
    return (
      <div className="kpi-grid">
        <div className="metric-card"><Spinner size={20} /></div>
      </div>
    );
  }
  const pr = lMetrics.activePurchaseRequests;
  const ar = lMetrics.assignmentReasonsThisMonth;
  const movDelta = calcMovementsDelta(lMetrics.movementsSparkline7d);

  return (
    <section aria-label="KPIs do líder" className="dashboard-section">
      {/* HERO compartilhado: líder também acompanha estoque (P3) */}
      <HeroCard
        icon={<ChartIcon size={20} />}
        title="Estado do estoque"
        subtitle="Visão de equipe · semana"
        healthChip={buildHealthChip(lMetrics.peripheralProjections)}
        equipments={lMetrics.equipmentsOverview}
        peripherals={lMetrics.peripheralsOverview}
        nextActions={projectionsToActions(lMetrics.peripheralProjections)}
        bellIcon={<BellIcon size={16} />}
        iconForCategory={HERO_ICON_FOR_CATEGORY}
        peripheralIcon={<MouseIcon size={16} />}
      />

      {/* KPIs gerenciais */}
      <div className="kpi-grid kpi-grid--icons">
        <IconKPI
          icon={<ActivityIcon />}
          iconColor="#4a82d6"
          label="Movimentações em 7 dias"
          value={lMetrics.movementsLast7Days}
          delta={movDelta}
          subtitle="Volume operacional da semana"
          trailing={
            <Sparkline
              data={lMetrics.movementsSparkline7d}
              color="#4a82d6"
              width={68}
              height={24}
            />
          }
        />
        <IconKPI
          icon={<ClockIcon />}
          iconColor={
            lMetrics.averageRepairTimeDays !== null &&
            lMetrics.averageRepairTimeDays > 21
              ? '#d8b15a'
              : '#2ea357'
          }
          label="Tempo médio em assistência"
          value={
            lMetrics.averageRepairTimeDays === null
              ? '—'
              : `${lMetrics.averageRepairTimeDays}d`
          }
          subtitle={
            lMetrics.averageRepairTimeDays === null
              ? 'Sem ciclos no trimestre'
              : 'Média dos últimos 90 dias'
          }
        />
        <IconKPI
          icon={<UserIcon />}
          iconColor="#2ea357"
          label="Atribuições no mês"
          value={ar.total}
          subtitle={assignmentsSubtitle(ar)}
        />
        <IconKPI
          icon={<ShoppingBagIcon />}
          iconColor="#4a82d6"
          label="Solicitações de compra"
          value={pr.total}
          subtitle={
            pr.total === 0
              ? 'Nenhuma em curso'
              : `${pr.aguardando} aguardando · ${pr.aberta} em compra`
          }
          onClick={onNavigatePR}
        />
      </div>
    </section>
  );
}

interface DirectorSectionProps {
  dMetrics: DirectorMetrics | null;
  onNavigatePR: () => void;
  onNavigateReports: () => void;
}

function DirectorSection({
  dMetrics,
  onNavigatePR,
  onNavigateReports,
}: DirectorSectionProps) {
  if (!dMetrics) {
    return (
      <div className="kpi-grid">
        <div className="metric-card"><Spinner size={20} /></div>
      </div>
    );
  }
  const pr = dMetrics.activePurchaseRequests;
  const ar = dMetrics.assignmentReasonsThisMonth;

  return (
    <section aria-label="KPIs do diretor" className="dashboard-section">
      <HeroCard
        icon={<BriefcaseIcon size={20} />}
        title="Estado do estoque"
        subtitle="Visão estratégica · mês"
        healthChip={buildHealthChip(dMetrics.peripheralProjections)}
        equipments={dMetrics.equipmentsOverview}
        peripherals={dMetrics.peripheralsOverview}
        nextActions={projectionsToActions(dMetrics.peripheralProjections)}
        bellIcon={<BellIcon size={16} />}
        iconForCategory={HERO_ICON_FOR_CATEGORY}
        peripheralIcon={<MouseIcon size={16} />}
      />

      <div className="kpi-grid kpi-grid--icons">
        <IconKPI
          icon={<ActivityIcon />}
          iconColor="#4a82d6"
          label="Movimentações no mês"
          value={dMetrics.movementsThisMonth}
          subtitle="Desde o dia 1"
        />
        <IconKPI
          icon={<UserIcon />}
          iconColor="#2ea357"
          label="Atribuições no mês"
          value={ar.total}
          subtitle={assignmentsSubtitle(ar)}
        />
        <IconKPI
          icon={<ShoppingBagIcon />}
          iconColor="#4a82d6"
          label="Solicitações de compra"
          value={pr.total}
          subtitle={
            pr.total === 0
              ? 'Nenhuma em curso'
              : `${pr.aguardando} aguardando · ${pr.aberta} em compra`
          }
          onClick={onNavigatePR}
        />
        <IconKPI
          icon={<BriefcaseIcon />}
          iconColor="#d8b15a"
          label="Compras justificadas"
          value="Relatório"
          subtitle="Gerar PDF/XLSX"
          onClick={onNavigateReports}
        />
      </div>
    </section>
  );
}
