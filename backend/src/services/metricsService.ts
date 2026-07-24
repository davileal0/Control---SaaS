import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { LOW_STOCK_THRESHOLD } from './stockThresholds';

// =====================================================================
// Métricas operacionais (KPIs)
// =====================================================================
// Centraliza cálculos do dashboard — cada papel pega um pacote diferente
// de métricas via /api/metrics/(operator|leader|director).
//
// Constantes operacionais:
//   - Janela "trimestre"        = 90 dias (taxa, tempo médio)
//   - Janela "semana"           = 7 dias (movimentações da equipe)
//   - Threshold "preso assist." = 21 dias
//   - Janela "consumo médio"    = 30 dias (projeção de esgotamento)
//
// Performance: queries simples por enquanto. Se virar gargalo, candidato
// natural a materializar com cron job ou cache de 5min.

const STUCK_IN_REPAIR_DAYS = 21;
const TEAM_WINDOW_DAYS = 7;
const REPAIR_AVG_WINDOW_DAYS = 90;
const CONSUMPTION_WINDOW_DAYS = 30;

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------
// Contagens simples
// ---------------------------------------------------------------------

/**
 * Filtro que define o que CONTA como "movimentação" de verdade.
 *
 * Movimentação = ação sobre um ativo existente: atribuir, devolver,
 * enviar/retornar de assistência, reaproveitar. EXCLUI:
 *   - Ingestão (cadastro): originStatus é null (ativo entrou no parque)
 *   - Descarte: registrado com notes começando em "[DESCARTE]" e
 *     originStatus === destinationStatus (só vira isArchived=true,
 *     o status não muda). Usamos o prefixo das notes como assinatura
 *     explícita e confiável do descarte.
 *
 * Aplicado em TODAS as contagens de movimentação (hoje, 7 dias, mês,
 * sparkline) pra a definição ser idêntica em qualquer janela/papel.
 */
const MOVEMENT_FILTER: Prisma.MovementLogWhereInput = {
  // Exclui ingestão (cadastro de ativo)
  originStatus: { not: null },
  // Exclui descarte (prefixo [DESCARTE] nas notes) SEM excluir por engano
  // as movimentações sem observação. Em SQL, `NOT (notes LIKE '[DESCARTE]%')`
  // vira NULL quando notes é NULL — e NULL não é TRUE, então a linha era
  // removida (bug: devoluções/reparos sem observação sumiam da contagem).
  // O OR abaixo mantém explicitamente as linhas com notes nulo.
  OR: [
    { notes: null },
    { NOT: { notes: { startsWith: '[DESCARTE]' } } },
  ],
};

export async function countAvailable() {
  return prisma.asset.count({
    where: { status: 'Disponivel', isArchived: false },
  });
}

export async function countInRepair() {
  return prisma.asset.count({
    where: { status: 'Danificado', isArchived: false },
  });
}

/** Movimentações reais HOJE (00:00 → agora). Exclui cadastro e descarte.
 *
 * Nota: o MovementLog não registra autor — não é possível filtrar
 * "do user X". Esta contagem é GLOBAL do dia. Pra ter "minhas movs"
 * no futuro seria necessária migration adicionando actorUserId no
 * MovementLog + atualizar todos os points de criação de log. */
export async function countMovementsToday() {
  return prisma.movementLog.count({
    where: { ...MOVEMENT_FILTER, timestamp: { gte: startOfDay() } },
  });
}

/** Movimentações reais nos últimos 7 dias. Exclui cadastro e descarte.
 * Sem filtro de papel (o schema não rastreia autor de log). */
export async function countMovementsLast7Days() {
  return prisma.movementLog.count({
    where: { ...MOVEMENT_FILTER, timestamp: { gte: daysAgo(TEAM_WINDOW_DAYS) } },
  });
}

/** Movimentações reais desde o dia 1 do mês. Exclui cadastro e descarte. */
export async function countMovementsThisMonth() {
  return prisma.movementLog.count({
    where: { ...MOVEMENT_FILTER, timestamp: { gte: startOfMonth() } },
  });
}

// ---------------------------------------------------------------------
// Saturação por categoria — total + EmUso + %
// ---------------------------------------------------------------------

export type CategorySaturation = {
  category: 'Notebook' | 'Celular' | 'AllInOne' | 'Periferico';
  total: number;
  inUse: number;
  percentage: number;
};

export async function getCategorySaturation(): Promise<CategorySaturation[]> {
  const groups = await prisma.asset.groupBy({
    by: ['category', 'status'],
    where: { isArchived: false },
    _count: { _all: true },
  });

  // Agrega total e inUse por categoria
  const acc = new Map<string, { total: number; inUse: number }>();
  for (const g of groups) {
    const cur = acc.get(g.category) ?? { total: 0, inUse: 0 };
    cur.total += g._count._all;
    if (g.status === 'EmUso') cur.inUse += g._count._all;
    acc.set(g.category, cur);
  }

  // Ordem fixa pra UI estável
  const order: CategorySaturation['category'][] = [
    'Notebook',
    'Celular',
    'AllInOne',
    'Periferico',
  ];

  return order.map((category) => {
    const cur = acc.get(category) ?? { total: 0, inUse: 0 };
    return {
      category,
      total: cur.total,
      inUse: cur.inUse,
      percentage: cur.total === 0 ? 0 : Math.round((cur.inUse / cur.total) * 100),
    };
  });
}

// ---------------------------------------------------------------------
// Tempo médio em assistência (ciclos COMPLETOS dentro da janela)
// ---------------------------------------------------------------------
// Ciclo = (log entrando em Danificado) → (log saindo de Danificado).
// Considera apenas ciclos cujo log de SAÍDA está dentro da janela
// (últimos N dias). Pega o log de entrada mais recente ANTES daquela saída.

export async function getAverageRepairTimeDays(): Promise<number | null> {
  // Logs de SAÍDA de Danificado (origem=Danificado) na janela
  const exits = await prisma.movementLog.findMany({
    where: {
      originStatus: 'Danificado',
      timestamp: { gte: daysAgo(REPAIR_AVG_WINDOW_DAYS) },
      // Ignora corrections — só transições reais
    },
    select: { assetSerialNumber: true, timestamp: true },
    orderBy: { timestamp: 'asc' },
  });

  if (exits.length === 0) return null;

  // Pra cada saída, busca a entrada IMEDIATAMENTE anterior
  const durations: number[] = [];
  for (const exit of exits) {
    const entry = await prisma.movementLog.findFirst({
      where: {
        assetSerialNumber: exit.assetSerialNumber,
        destinationStatus: 'Danificado',
        timestamp: { lt: exit.timestamp },
      },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    if (entry) {
      const days = daysBetween(entry.timestamp, exit.timestamp);
      if (days >= 0) durations.push(days);
    }
  }

  if (durations.length === 0) return null;
  const sum = durations.reduce((a, b) => a + b, 0);
  return Math.round(sum / durations.length);
}

// ---------------------------------------------------------------------
// Lista de ativos PRESOS em assistência > N dias (atualmente)
// ---------------------------------------------------------------------
// Pra cada asset em status Danificado, acha o último log de transição
// PRA Danificado (destinationStatus = Danificado). Diferença pra hoje
// é o "tempo em assistência atual". Lista os que > threshold.

export type StuckInRepair = {
  serialNumber: string;
  model: string;
  category: string;
  daysInRepair: number;
  enteredAt: string; // ISO
};

export async function getStuckInRepair(): Promise<StuckInRepair[]> {
  const broken = await prisma.asset.findMany({
    where: { status: 'Danificado', isArchived: false },
    select: { serialNumber: true, model: true, category: true },
  });

  const result: StuckInRepair[] = [];
  const now = new Date();
  for (const asset of broken) {
    // Último log de entrada em Danificado (destinationStatus)
    const entry = await prisma.movementLog.findFirst({
      where: {
        assetSerialNumber: asset.serialNumber,
        destinationStatus: 'Danificado',
      },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    if (!entry) continue;

    const days = daysBetween(entry.timestamp, now);
    if (days >= STUCK_IN_REPAIR_DAYS) {
      result.push({
        serialNumber: asset.serialNumber,
        model: asset.model,
        category: asset.category,
        daysInRepair: days,
        enteredAt: entry.timestamp.toISOString(),
      });
    }
  }

  // Ordena por mais tempo preso primeiro (urgência)
  return result.sort((a, b) => b.daysInRepair - a.daysInRepair);
}

// ---------------------------------------------------------------------
// SCs ativas — contagem total + breakdown
// ---------------------------------------------------------------------

export type ActivePurchaseRequestsSummary = {
  total: number;
  aguardando: number;
  aberta: number;
};

export async function getActivePurchaseRequests(): Promise<ActivePurchaseRequestsSummary> {
  const [aguardando, aberta] = await Promise.all([
    prisma.purchaseRequest.count({ where: { status: 'AGUARDANDO_ABERTURA' } }),
    prisma.purchaseRequest.count({ where: { status: 'ABERTA' } }),
  ]);
  return { total: aguardando + aberta, aguardando, aberta };
}

// ---------------------------------------------------------------------
// Motivos de atribuição no mês (Aumento de quadro vs Substituição)
// ---------------------------------------------------------------------
// Conta logs de atribuição (destinationStatus = EmUso) criados no mês
// atual, agrupados pelo motivo. Exclui logs anulados (isVoided) — o
// motivo de um log anulado não conta pra KPI.
//
// Logs anteriores à migration 0006 têm assignmentReason = null e ficam
// fora deste agregado por design (vide P2 do alinhamento).

// Intenção (sub-categoria) agregada: motivo principal + detalhe + contagem.
export type AssignmentIntentStat = {
  reason: 'AUMENTO_QUADRO' | 'SUBSTITUICAO';
  detail: string;
  count: number;
};

export type AssignmentReasonsSummary = {
  aumentoQuadro: number;
  substituicao: number;
  total: number;
  // Principais intenções do mês (mais frequentes primeiro), pra detalhar
  // o KPI. Vazio quando ninguém preencheu intenção no período.
  topIntents: AssignmentIntentStat[];
};

export async function getAssignmentReasonsThisMonth(): Promise<AssignmentReasonsSummary> {
  const since = startOfMonth();
  const [aumentoQuadro, substituicao, intentsGrouped] = await Promise.all([
    prisma.movementLog.count({
      where: {
        timestamp: { gte: since },
        destinationStatus: 'EmUso',
        isVoided: false,
        assignmentReason: 'AUMENTO_QUADRO',
      },
    }),
    prisma.movementLog.count({
      where: {
        timestamp: { gte: since },
        destinationStatus: 'EmUso',
        isVoided: false,
        assignmentReason: 'SUBSTITUICAO',
      },
    }),
    prisma.movementLog.groupBy({
      by: ['assignmentReason', 'assignmentReasonDetail'],
      where: {
        timestamp: { gte: since },
        destinationStatus: 'EmUso',
        isVoided: false,
        assignmentReasonDetail: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const topIntents: AssignmentIntentStat[] = intentsGrouped
    .map((g: {
      assignmentReason: 'AUMENTO_QUADRO' | 'SUBSTITUICAO' | null;
      assignmentReasonDetail: string | null;
      _count: { _all: number };
    }) => ({
      reason: g.assignmentReason,
      detail: g.assignmentReasonDetail ?? '',
      count: g._count._all,
    }))
    .filter(
      (g): g is AssignmentIntentStat => g.reason !== null && g.detail.length > 0,
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    aumentoQuadro,
    substituicao,
    total: aumentoQuadro + substituicao,
    topIntents,
  };
}

// ---------------------------------------------------------------------
// Sparkline — movimentações por dia, últimos 7 dias
// ---------------------------------------------------------------------
// Retorna array de 7 inteiros, ordem cronológica (índice 0 = 6 dias
// atrás, índice 6 = hoje). Alimenta mini-gráfico no card "Movs hoje".

export async function getMovementsSparkline7Days(): Promise<number[]> {
  const counts: number[] = [];
  const today = startOfDay();

  // 7 queries pequenas — gargalo desprezível pro volume atual.
  // Se um dia bater >50ms, migrar pra groupBy + window.
  for (let i = 6; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const count = await prisma.movementLog.count({
      where: {
        ...MOVEMENT_FILTER,
        timestamp: { gte: start, lt: end },
        isVoided: false,
      },
    });
    counts.push(count);
  }
  return counts;
}

// ---------------------------------------------------------------------
// Breakdown do estoque — total geral + por categoria
// ---------------------------------------------------------------------
// Alimenta o HERO do dashboard: "X Disponíveis (Notebook N · Periférico P)
// | Y Em assistência | Z Em uso". Substitui os 5 cards uniformes do topo
// por 1 hero estruturado.

export type StockBreakdown = {
  available: {
    total: number;
    byCategory: Array<{ category: string; count: number }>;
  };
  inRepair: number;
  inUse: number;
};

export async function getStockBreakdown(): Promise<StockBreakdown> {
  const [byCat, inRepair, inUse] = await Promise.all([
    prisma.asset.groupBy({
      by: ['category'],
      where: { status: 'Disponivel', isArchived: false },
      _count: { _all: true },
    }),
    prisma.asset.count({
      where: { status: 'Danificado', isArchived: false },
    }),
    prisma.asset.count({
      where: { status: 'EmUso', isArchived: false },
    }),
  ]);

  const byCategory = byCat
    .map((g: { category: string; _count: { _all: number } }) => ({
      category: g.category,
      count: g._count._all,
    }))
    .filter((g: { count: number }) => g.count > 0)
    // Ordem fixa pra apresentação consistente
    .sort((a: { category: string }, b: { category: string }) => {
      const order = ['Notebook', 'Desktop', 'Celular', 'AllInOne', 'Periferico'];
      return order.indexOf(a.category) - order.indexOf(b.category);
    });

  const total = byCategory.reduce(
    (sum: number, g: { count: number }) => sum + g.count,
    0,
  );

  return {
    available: { total, byCategory },
    inRepair,
    inUse,
  };
}

// ---------------------------------------------------------------------
// Projeção de esgotamento de periféricos
// ---------------------------------------------------------------------
// Pra cada tipo de periférico (model) com estoque baixo (≤ threshold),
// calcula:
//   - currentStock: quantidade DISPONÍVEL agora
//   - consumed30d:  quantas saídas (Disponível→EmUso) nos últimos 30 dias
//   - daysRemaining: stock atual ÷ consumo médio diário
//
// Se consumo foi ZERO nos últimos 30d, daysRemaining = null (não dá pra
// projetar futuro a partir de zero atividade — mostrar "—" no frontend).
//
// Alimenta o bloco "Próxima ação sugerida" no hero. Lista ordenada por
// urgência (menos dias = mais urgente).

export type PeripheralProjection = {
  model: string;
  currentStock: number;
  consumed30d: number;
  /** Dias até esgotar baseado em consumo médio. null = sem consumo. */
  daysRemaining: number | null;
};

export async function getPeripheralProjections(): Promise<PeripheralProjection[]> {
  // 1. Agrupa periféricos disponíveis por model
  const grouped = await prisma.asset.groupBy({
    by: ['model'],
    where: {
      category: 'Periferico',
      status: 'Disponivel',
      isArchived: false,
    },
    _count: { _all: true },
  });

  // 2. Filtra apenas os com estoque baixo
  const lowStock = grouped.filter(
    (g: { model: string; _count: { _all: number } }) =>
      g._count._all <= LOW_STOCK_THRESHOLD,
  );

  // 3. Pra cada um, calcula consumo dos últimos 30d
  const since = daysAgo(CONSUMPTION_WINDOW_DAYS);
  const projections: PeripheralProjection[] = [];

  for (const group of lowStock) {
    const consumed = await prisma.movementLog.count({
      where: {
        asset: {
          model: group.model,
          category: 'Periferico',
        },
        originStatus: 'Disponivel',
        destinationStatus: 'EmUso',
        timestamp: { gte: since },
        isVoided: false,
      },
    });

    const dailyAvg = consumed / CONSUMPTION_WINDOW_DAYS;
    const daysRemaining =
      dailyAvg > 0 ? Math.floor(group._count._all / dailyAvg) : null;

    projections.push({
      model: group.model,
      currentStock: group._count._all,
      consumed30d: consumed,
      daysRemaining,
    });
  }

  // 4. Ordena por urgência: menos dias primeiro, null por último
  projections.sort((a, b) => {
    if (a.daysRemaining === null && b.daysRemaining === null) return 0;
    if (a.daysRemaining === null) return 1;
    if (b.daysRemaining === null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });

  return projections;
}

// ---------------------------------------------------------------------
// Overview detalhado — equipamentos rastreados + periféricos commodity
// ---------------------------------------------------------------------
// Substitui o stockBreakdown anterior por uma versão MAIS GRANULAR
// que serve ao hero interativo. Diferencia:
//   - EQUIPAMENTOS (Notebook/Desktop/Celular/AllInOne): 3 dimensões
//     (Disponível / Em assistência / Em uso) porque são rastreados
//     individualmente
//   - PERIFÉRICOS (Mouse, Teclado, etc): 2 dimensões reais (Disponível
//     + Saídas no mês), porque NÃO rastreamos atribuição individual
//     (decisão P3 do alinhamento)

export type EquipmentOverview = {
  category: 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne';
  available: number;
  inRepair: number;
  inUse: number;
};

export type PeripheralOverview = {
  model: string;
  available: number;
  consumed30d: number;
  daysRemaining: number | null;
};

export async function getEquipmentsOverview(): Promise<EquipmentOverview[]> {
  const categories: EquipmentOverview['category'][] = [
    'Notebook',
    'Desktop',
    'Celular',
    'AllInOne',
  ];
  const results: EquipmentOverview[] = [];
  for (const category of categories) {
    const [available, inRepair, inUse] = await Promise.all([
      prisma.asset.count({
        where: { category, status: 'Disponivel', isArchived: false },
      }),
      prisma.asset.count({
        where: { category, status: 'Danificado', isArchived: false },
      }),
      prisma.asset.count({
        where: { category, status: 'EmUso', isArchived: false },
      }),
    ]);
    results.push({ category, available, inRepair, inUse });
  }
  return results;
}

export async function getPeripheralsOverview(): Promise<PeripheralOverview[]> {
  // 1. groupBy de TODOS os periféricos não-arquivados (não só disponíveis;
  //    pra mostrar tipos com 0 disp também — operador pode querer ver "Mouse
  //    zerado, todos saíram"). Usa todos os assets dessa categoria pra
  //    descobrir os MODELS existentes.
  const grouped = await prisma.asset.groupBy({
    by: ['model'],
    where: {
      category: 'Periferico',
      isArchived: false,
    },
    _count: { _all: true },
  });

  // 2. Pra cada model, calcula disponível atual + consumo dos últimos 30d
  const since = daysAgo(CONSUMPTION_WINDOW_DAYS);
  const results: PeripheralOverview[] = [];

  for (const group of grouped) {
    const [available, consumed] = await Promise.all([
      prisma.asset.count({
        where: {
          category: 'Periferico',
          model: group.model,
          status: 'Disponivel',
          isArchived: false,
        },
      }),
      prisma.movementLog.count({
        where: {
          asset: { model: group.model, category: 'Periferico' },
          originStatus: 'Disponivel',
          destinationStatus: 'EmUso',
          timestamp: { gte: since },
          isVoided: false,
        },
      }),
    ]);

    const daily = consumed / CONSUMPTION_WINDOW_DAYS;
    const daysRemaining = daily > 0 ? Math.floor(available / daily) : null;

    results.push({
      model: group.model,
      available,
      consumed30d: consumed,
      daysRemaining,
    });
  }

  // 3. Ordena por nome do model (alfabético) pra apresentação estável
  return results.sort((a: PeripheralOverview, b: PeripheralOverview) =>
    a.model.localeCompare(b.model),
  );
}

// ---------------------------------------------------------------------
// Pacotes por papel — composição final
// ---------------------------------------------------------------------

export async function getOperatorMetrics() {
  const [
    availableForAssignment,
    inRepair,
    movementsToday,
    movementsSparkline7d,
    activePurchaseRequests,
    stockBreakdown,
    peripheralProjections,
    equipmentsOverview,
    peripheralsOverview,
  ] = await Promise.all([
    countAvailable(),
    countInRepair(),
    countMovementsToday(),
    getMovementsSparkline7Days(),
    getActivePurchaseRequests(),
    getStockBreakdown(),
    getPeripheralProjections(),
    getEquipmentsOverview(),
    getPeripheralsOverview(),
  ]);
  return {
    availableForAssignment,
    inRepair,
    movementsToday,
    movementsSparkline7d,
    activePurchaseRequests,
    stockBreakdown,
    peripheralProjections,
    equipmentsOverview,
    peripheralsOverview,
  };
}

export async function getLeaderMetrics() {
  const [
    movementsLast7Days,
    movementsSparkline7d,
    averageRepairTimeDays,
    stuckInRepair,
    saturationByCategory,
    activePurchaseRequests,
    assignmentReasonsThisMonth,
    stockBreakdown,
    peripheralProjections,
    equipmentsOverview,
    peripheralsOverview,
  ] = await Promise.all([
    countMovementsLast7Days(),
    getMovementsSparkline7Days(),
    getAverageRepairTimeDays(),
    getStuckInRepair(),
    getCategorySaturation(),
    getActivePurchaseRequests(),
    getAssignmentReasonsThisMonth(),
    getStockBreakdown(),
    getPeripheralProjections(),
    getEquipmentsOverview(),
    getPeripheralsOverview(),
  ]);
  return {
    movementsLast7Days,
    movementsSparkline7d,
    averageRepairTimeDays,
    stuckInRepair,
    saturationByCategory,
    activePurchaseRequests,
    assignmentReasonsThisMonth,
    stockBreakdown,
    peripheralProjections,
    equipmentsOverview,
    peripheralsOverview,
  };
}

export async function getDirectorMetrics() {
  const [
    movementsThisMonth,
    movementsSparkline7d,
    saturationByCategory,
    activePurchaseRequests,
    assignmentReasonsThisMonth,
    stockBreakdown,
    peripheralProjections,
    equipmentsOverview,
    peripheralsOverview,
  ] = await Promise.all([
    countMovementsThisMonth(),
    getMovementsSparkline7Days(),
    getCategorySaturation(),
    getActivePurchaseRequests(),
    getAssignmentReasonsThisMonth(),
    getStockBreakdown(),
    getPeripheralProjections(),
    getEquipmentsOverview(),
    getPeripheralsOverview(),
  ]);
  return {
    movementsThisMonth,
    movementsSparkline7d,
    saturationByCategory,
    activePurchaseRequests,
    assignmentReasonsThisMonth,
    stockBreakdown,
    peripheralProjections,
    equipmentsOverview,
    peripheralsOverview,
  };
}
