import { ReactNode, useState, useEffect, useRef } from 'react';
import './kpi-cards.css';

// ---------------------------------------------------------------------
// CountUp — anima um número de 0 até o valor final (técnica C).
// ---------------------------------------------------------------------
// Conta de 0 ao alvo em ~650ms com easing suave (easeOutCubic). É uma
// mudança de VALOR, não de posição — segura pra sensibilidade
// vestibular (não há movimento espacial, zoom nem deslocamento).
// Respeita prefers-reduced-motion: nesse caso mostra o valor final
// instantaneamente.
function CountUp({
  value,
  duration = 650,
  format,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    // Respeita quem prefere menos movimento — sem animar
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (prefersReduced || value === 0) {
      setDisplay(value);
      return;
    }

    startRef.current = null;
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic — começa rápido, desacelera no fim
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <>{format ? format(display) : display}</>;
}

// =====================================================================
// Componentes de KPI usados nos dashboards por papel.
// =====================================================================
// Mantemos 3 variantes com a mesma estética base (card glassy) mas
// estruturas diferentes pra dados diferentes:
//   - MetricCard:        número grande + label (+ subtítulo opcional)
//   - MetricListCard:    título + lista compacta de itens
//   - SaturationTable:   título + tabela de % com barra horizontal

// ---------------------------------------------------------------------
// Card de número único
// ---------------------------------------------------------------------

export interface MetricCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  intent?: 'default' | 'warning' | 'critical' | 'success' | 'info';
  icon?: ReactNode;
  onClick?: () => void;
  /** Quando true, mostra "—" pequeno em vez do número (sem dados ainda) */
  empty?: boolean;
}

export function MetricCard({
  label,
  value,
  subtitle,
  intent = 'default',
  icon,
  onClick,
  empty = false,
}: MetricCardProps) {
  const clickable = !!onClick;
  return (
    <div
      className={`metric-card metric-card--${intent} ${clickable ? 'metric-card--clickable' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="metric-card__head">
        <span className="metric-card__label">{label}</span>
        {icon && <span className="metric-card__icon">{icon}</span>}
      </div>
      <div className="metric-card__value">
        {empty ? <span className="metric-card__empty">—</span> : value}
      </div>
      {subtitle && <div className="metric-card__subtitle">{subtitle}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Card com lista (ex: presos em assistência > 21 dias)
// ---------------------------------------------------------------------

export interface ListItem {
  key: string;
  primary: string; // ex: model
  secondary?: string; // ex: SN
  trailing?: string; // ex: "27 dias"
  trailingIntent?: 'warning' | 'critical' | 'default';
}

export interface MetricListCardProps {
  label: string;
  items: ListItem[];
  emptyMessage: string;
  /** Total count, mostrado ao lado do label se diferente de items.length */
  totalCount?: number;
}

export function MetricListCard({
  label,
  items,
  emptyMessage,
  totalCount,
}: MetricListCardProps) {
  return (
    <div className="metric-list-card">
      <div className="metric-list-card__head">
        <span className="metric-card__label">{label}</span>
        {totalCount !== undefined && totalCount > 0 && (
          <span className="metric-list-card__count">{totalCount}</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="metric-list-card__empty">{emptyMessage}</div>
      ) : (
        <ul className="metric-list-card__list">
          {items.map((it) => (
            <li key={it.key} className="metric-list-card__item">
              <div className="metric-list-card__main">
                <span className="metric-list-card__primary">{it.primary}</span>
                {it.secondary && (
                  <code className="metric-list-card__secondary">
                    {it.secondary}
                  </code>
                )}
              </div>
              {it.trailing && (
                <span
                  className={`metric-list-card__trailing metric-list-card__trailing--${it.trailingIntent ?? 'default'}`}
                >
                  {it.trailing}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Tabela de saturação por categoria
// ---------------------------------------------------------------------

import { CategorySaturation, CATEGORY_LABEL_SHORT } from '../types/domain';

export interface SaturationTableProps {
  label: string;
  rows: CategorySaturation[];
}

export function SaturationTable({ label, rows }: SaturationTableProps) {
  return (
    <div className="saturation-card">
      <div className="metric-card__head">
        <span className="metric-card__label">{label}</span>
      </div>
      <ul className="saturation-table">
        {rows.map((r) => {
          // Cor por nível: < 60 = ok / 60-85 = atenção / > 85 = crítico
          const intent =
            r.percentage > 85
              ? 'critical'
              : r.percentage > 60
                ? 'warning'
                : 'ok';
          return (
            <li
              key={r.category}
              className={`saturation-row saturation-row--${intent}`}
            >
              <span className="saturation-row__name">
                {CATEGORY_LABEL_SHORT[r.category]}
              </span>
              <div className="saturation-row__bar-wrap">
                <div
                  className="saturation-row__bar"
                  style={{ width: `${r.percentage}%` }}
                />
              </div>
              <span className="saturation-row__pct">{r.percentage}%</span>
              <span className="saturation-row__count">
                {r.inUse}/{r.total}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// IconKPI — card KPI com ícone colorido (estilo dashboard moderno)
// ---------------------------------------------------------------------
// Visual: ícone num quadrado de cor saturada (esquerda) + número grande
// + label pequena. Opcional: sparkline ou delta vs período anterior.
//
// O ícone E sua cor SEMÂNTICA são responsabilidade do CHAMADOR — esse
// componente só renderiza. Por convenção:
//   - verde   = ok / disponível / sucesso (#2ea357)
//   - amarelo = atenção / pendente        (#d8b15a)
//   - vermelho = ação requerida           (var(--led))
//   - azul    = informativo neutro         (#4a82d6)

export interface IconKPIProps {
  icon: ReactNode;
  label: string;
  value: number | string;
  /** Cor do quadrado do ícone (hex ou var CSS) */
  iconColor: string;
  /** Subtítulo discreto abaixo do número (opcional) */
  subtitle?: string;
  /** Mini-gráfico (Sparkline) à direita do número (opcional) */
  trailing?: ReactNode;
  /** Delta vs período anterior (+12 / -3); pintado por sinal */
  delta?: number;
  onClick?: () => void;
}

export function IconKPI({
  icon,
  label,
  value,
  iconColor,
  subtitle,
  trailing,
  delta,
  onClick,
}: IconKPIProps) {
  const clickable = !!onClick;
  return (
    <div
      className={`icon-kpi ${clickable ? 'icon-kpi--clickable' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="icon-kpi__icon" style={{ background: `${iconColor}22`, color: iconColor }}>
        {icon}
      </div>
      <div className="icon-kpi__body">
        <div className="icon-kpi__label">{label}</div>
        <div className="icon-kpi__value-row">
          <span className="icon-kpi__value">{value}</span>
          {delta !== undefined && delta !== 0 && (
            <span className={`icon-kpi__delta icon-kpi__delta--${delta > 0 ? 'up' : 'down'}`}>
              {delta > 0 ? '↑' : '↓'}
              {Math.abs(delta)}
            </span>
          )}
        </div>
        {subtitle && <div className="icon-kpi__subtitle">{subtitle}</div>}
      </div>
      {trailing && <div className="icon-kpi__trailing">{trailing}</div>}
    </div>
  );
}

// =====================================================================
// HeroCard — bloco principal INTERATIVO do dashboard
// =====================================================================
// 3 estados (controlados por chips no topo):
//
//   1. OVERVIEW (default) — mostra resumo compacto de TODAS as categorias
//      lado a lado. 2 colunas: Equipamentos (3 dimensões) | Periféricos
//      (1 dimensão). Operador vê o status do estoque inteiro de relance.
//
//   2. EQUIPAMENTO selecionado (Notebook/Desktop/Celular/AllInOne) —
//      mostra 3 stats grandes da categoria (Disponível / Em assist. /
//      Em uso). Equipamentos são rastreados individualmente.
//
//   3. PERIFÉRICO selecionado (Mouse, Teclado, etc) — mostra 3 stats
//      adaptados: Disponível atual, Saídas no mês (consumo) e Projeção
//      de esgotamento. Periféricos NÃO são rastreados individualmente
//      (decisão P3); por isso "Em uso" some pra eles.
//
// O chip "Visão geral" volta o usuário pro overview.

import type { EquipmentOverview, PeripheralOverview } from '../types/domain';

const EQUIPMENT_LABELS: Record<EquipmentOverview['category'], string> = {
  Notebook: 'Notebook',
  Desktop: 'Desktop',
  Celular: 'Celular',
  AllInOne: 'All-in-One',
};

const ALL_EQUIPMENT_CATEGORIES: EquipmentOverview['category'][] = [
  'Notebook',
  'Desktop',
  'Celular',
  'AllInOne',
];

export interface HeroNextAction {
  model: string;
  currentStock: number;
  daysRemaining: number | null;
}

export interface HeroCardProps {
  equipments: EquipmentOverview[];
  peripherals: PeripheralOverview[];
  nextActions?: HeroNextAction[];
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  healthChip?: { label: string; intent: 'ok' | 'warning' | 'critical' };
  bellIcon?: ReactNode;
  /** Ícones por categoria/tipo pra dar contexto visual */
  iconForCategory?: Partial<Record<EquipmentOverview['category'], ReactNode>>;
  peripheralIcon?: ReactNode;
}

type Selection =
  | { kind: 'overview' }
  | { kind: 'equipment'; category: EquipmentOverview['category'] }
  | { kind: 'peripheral'; model: string };

export function HeroCard({
  equipments,
  peripherals,
  nextActions,
  icon,
  title = 'Estado do estoque',
  subtitle,
  healthChip,
  bellIcon,
  iconForCategory,
  peripheralIcon,
}: HeroCardProps) {
  // Sempre começa em overview (decisão C3: B). Não persistir em localStorage.
  const [selection, setSelection] = useState<Selection>({ kind: 'overview' });

  const hasActions = nextActions && nextActions.length > 0;
  // Calcula o título dinâmico (breadcrumb-like)
  let dynamicTitle = title;
  if (selection.kind === 'equipment') {
    dynamicTitle = `${title} › ${EQUIPMENT_LABELS[selection.category]}`;
  } else if (selection.kind === 'peripheral') {
    dynamicTitle = `${title} › ${selection.model}`;
  }

  return (
    <div className={`hero-card ${hasActions ? 'hero-card--with-actions' : ''}`}>
      <div className="hero-card__main">
        <div className="hero-card__header">
          {icon && <div className="hero-card__icon">{icon}</div>}
          <div className="hero-card__header-text">
            <span className="hero-card__title">{dynamicTitle}</span>
            {subtitle && <span className="hero-card__subtitle">{subtitle}</span>}
          </div>
          {healthChip && (
            <span className={`hero-health-chip hero-health-chip--${healthChip.intent}`}>
              <span className="hero-health-chip__dot" aria-hidden="true" />
              {healthChip.label}
            </span>
          )}
        </div>

        {/* Chips de filtro: Visão geral + categorias fixas + periféricos dinâmicos */}
        <div className="hero-chips" role="tablist" aria-label="Filtrar estado do estoque">
          <HeroChip
            label="Visão geral"
            active={selection.kind === 'overview'}
            onClick={() => setSelection({ kind: 'overview' })}
          />
          {ALL_EQUIPMENT_CATEGORIES.map((cat) => (
            <HeroChip
              key={cat}
              label={EQUIPMENT_LABELS[cat]}
              active={selection.kind === 'equipment' && selection.category === cat}
              onClick={() => setSelection({ kind: 'equipment', category: cat })}
            />
          ))}
          {peripherals.map((p) => (
            <HeroChip
              key={p.model}
              label={p.model}
              active={selection.kind === 'peripheral' && selection.model === p.model}
              onClick={() => setSelection({ kind: 'peripheral', model: p.model })}
            />
          ))}
        </div>

        {/* Conteúdo conforme seleção */}
        {selection.kind === 'overview' && (
          <OverviewBody
            equipments={equipments}
            peripherals={peripherals}
            onSelectEquipment={(cat) =>
              setSelection({ kind: 'equipment', category: cat })
            }
            onSelectPeripheral={(model) =>
              setSelection({ kind: 'peripheral', model })
            }
            iconForCategory={iconForCategory}
            peripheralIcon={peripheralIcon}
          />
        )}

        {selection.kind === 'equipment' && (
          <EquipmentBody
            data={
              equipments.find((e) => e.category === selection.category) ?? {
                category: selection.category,
                available: 0,
                inRepair: 0,
                inUse: 0,
              }
            }
          />
        )}

        {selection.kind === 'peripheral' && (
          <PeripheralBody
            data={
              peripherals.find((p) => p.model === selection.model) ?? {
                model: selection.model,
                available: 0,
                consumed30d: 0,
                daysRemaining: null,
              }
            }
          />
        )}
      </div>

      {/* Próxima ação sugerida — sempre global (decisão P5: A) */}
      {hasActions && (
        <div className="hero-card__actions">
          <div className="hero-card__actions-header">
            {bellIcon && <div className="hero-card__actions-bell">{bellIcon}</div>}
            <span className="hero-card__actions-title">Próxima ação sugerida</span>
          </div>
          <ul className="hero-card__actions-list">
            {nextActions!.map((a) => (
              <li key={a.model} className="hero-action">
                <span className="hero-action__pulse" aria-hidden="true" />
                <span className="hero-action__label">
                  {/* Instrução acionável: verbo + o que fazer + o porquê.
                      Ex: "Repor Mouse USB Dell — estoque baixo". Quando há
                      consumo, acrescenta a projeção de esgotamento. */}
                  <strong>Repor {a.model}</strong> —{' '}
                  {a.daysRemaining !== null
                    ? `estoque baixo · esgota em ~${a.daysRemaining}d`
                    : 'estoque baixo'}
                </span>
                <span className="hero-action__hint">
                  {a.currentStock} {a.currentStock === 1 ? 'unidade' : 'unidades'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- Subcomponentes do HeroCard ----------

function HeroChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`hero-chip ${active ? 'hero-chip--active' : ''}`}
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

interface OverviewBodyProps {
  equipments: EquipmentOverview[];
  peripherals: PeripheralOverview[];
  onSelectEquipment: (cat: EquipmentOverview['category']) => void;
  onSelectPeripheral: (model: string) => void;
  iconForCategory?: Partial<Record<EquipmentOverview['category'], ReactNode>>;
  peripheralIcon?: ReactNode;
}

function OverviewBody({
  equipments,
  peripherals,
  onSelectEquipment,
  onSelectPeripheral,
  iconForCategory,
  peripheralIcon,
}: OverviewBodyProps) {
  return (
    <div className="hero-overview">
      {/* Coluna esquerda: equipamentos rastreáveis */}
      <div className="hero-overview__section">
        <div className="hero-overview__section-title">Equipamentos</div>
        {/* Cabeçalho de coluna — rótulos coloridos casando com os números.
            Lê-se uma vez, vale pra todas as linhas (padrão de tabela). */}
        <div className="hero-overview-row hero-overview__colhead" aria-hidden="true">
          <span className="hero-overview-row__icon" />
          <span className="hero-overview-row__name" />
          <span className="hero-overview-row__nums hero-overview-row__nums--head">
            <span className="hero-colhead hero-colhead--avail">Disponível</span>
            <span className="hero-colhead hero-colhead--repair">Em assistência</span>
            <span className="hero-colhead hero-colhead--inuse">Em uso</span>
          </span>
        </div>
        <ul className="hero-overview__list">
          {equipments.map((eq) => (
            <li
              key={eq.category}
              className="hero-overview-row hero-overview-row--equipment"
              onClick={() => onSelectEquipment(eq.category)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectEquipment(eq.category);
                }
              }}
              aria-label={`Ver ${EQUIPMENT_LABELS[eq.category]} em detalhe`}
            >
              {iconForCategory?.[eq.category] && (
                <span className="hero-overview-row__icon">
                  {iconForCategory[eq.category]}
                </span>
              )}
              <span className="hero-overview-row__name">
                {EQUIPMENT_LABELS[eq.category]}
              </span>
              <span className="hero-overview-row__nums">
                <span className="hero-overview-row__num hero-overview-row__num--avail">
                  <CountUp value={eq.available} />
                </span>
                <span className="hero-overview-row__num hero-overview-row__num--repair">
                  <CountUp value={eq.inRepair} />
                </span>
                <span className="hero-overview-row__num hero-overview-row__num--inuse">
                  <CountUp value={eq.inUse} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Coluna direita: periféricos commodity (só disponível) */}
      <div className="hero-overview__section">
        <div className="hero-overview__section-title">Periféricos</div>
        {peripherals.length === 0 ? (
          <p className="hero-overview__empty">
            Nenhum tipo de periférico cadastrado ainda.
          </p>
        ) : (
          <>
            <div
              className="hero-overview-row hero-overview__colhead"
              aria-hidden="true"
            >
              <span className="hero-overview-row__icon" />
              <span className="hero-overview-row__name" />
              <span className="hero-overview-row__nums hero-overview-row__nums--head">
                <span className="hero-colhead hero-colhead--avail">
                  Disponível
                </span>
              </span>
            </div>
            <ul className="hero-overview__list">
              {peripherals.map((p) => (
                <li
                  key={p.model}
                  className="hero-overview-row hero-overview-row--peripheral"
                  onClick={() => onSelectPeripheral(p.model)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectPeripheral(p.model);
                    }
                  }}
                  aria-label={`Ver ${p.model} em detalhe`}
                >
                  {peripheralIcon && (
                    <span className="hero-overview-row__icon">
                      {peripheralIcon}
                    </span>
                  )}
                  <span className="hero-overview-row__name">{p.model}</span>
                  <span className="hero-overview-row__nums">
                    <span className="hero-overview-row__num hero-overview-row__num--avail">
                      <CountUp value={p.available} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function EquipmentBody({ data }: { data: EquipmentOverview }) {
  return (
    <div className="hero-focus">
      <div className="hero-focus-stat hero-focus-stat--available">
        <div className="hero-focus-stat__value">
          <CountUp value={data.available} />
        </div>
        <div className="hero-focus-stat__label">Disponível</div>
      </div>
      <div className="hero-focus-stat hero-focus-stat--repair">
        <div className="hero-focus-stat__value">
          <CountUp value={data.inRepair} />
        </div>
        <div className="hero-focus-stat__label">Em assistência</div>
      </div>
      <div className="hero-focus-stat hero-focus-stat--inuse">
        <div className="hero-focus-stat__value">
          <CountUp value={data.inUse} />
        </div>
        <div className="hero-focus-stat__label">Em uso</div>
      </div>
    </div>
  );
}

function PeripheralBody({ data }: { data: PeripheralOverview }) {
  return (
    <div className="hero-focus">
      <div className="hero-focus-stat hero-focus-stat--available">
        <div className="hero-focus-stat__value">
          <CountUp value={data.available} />
        </div>
        <div className="hero-focus-stat__label">Disponível</div>
      </div>
      <div className="hero-focus-stat hero-focus-stat--consumption">
        <div className="hero-focus-stat__value">
          <CountUp value={data.consumed30d} />
        </div>
        <div className="hero-focus-stat__label">Saídas no mês</div>
      </div>
      <div className="hero-focus-stat hero-focus-stat--projection">
        <div className="hero-focus-stat__value">
          {data.daysRemaining !== null ? (
            <CountUp
              value={data.daysRemaining}
              format={(n) => `~${n}d`}
            />
          ) : (
            '—'
          )}
        </div>
        <div className="hero-focus-stat__label">
          {data.daysRemaining !== null ? 'Projeção de fim' : 'Sem consumo'}
        </div>
      </div>
    </div>
  );
}
