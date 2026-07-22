// =====================================================================
// Serviço de dados do Relatório de Defesa de Compra (multi-categoria)
// =====================================================================
// Junta, por categoria selecionada:
//   - DADOS DO BANCO: descartes reais + motivos, saldo de estoque atual
//   - INPUT DO USUÁRIO: sugestão, fila (novos/substituição), estoque de
//     segurança + raciocínio, último lote (KACE), doações
// E globalmente: a economia negociada (desconto × lote).
//
// O resultado é um payload pronto pro gerador de PDF (Fase 2).

import { prisma } from '../db/prisma';
import {
  PurchaseDefenseReportInput,
  DefenseCategoryInput,
} from '../validation/schemas';

type DefenseCategory = 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne';

// Rótulos legíveis por categoria (plural, pro texto do relatório)
const CATEGORY_LABEL: Record<DefenseCategory, string> = {
  Notebook: 'Notebooks',
  Desktop: 'Desktops',
  Celular: 'Celulares',
  AllInOne: 'All in One',
};

export function defenseCategoryLabel(c: DefenseCategory): string {
  return CATEGORY_LABEL[c] ?? c;
}

// ---------------------------------------------------------------------
// Tipos do payload retornado (consumido pelo gerador de PDF)
// ---------------------------------------------------------------------

export interface DefenseDiscardItem {
  serialNumber: string;
  model: string;
  reason: string;
  discardedAt: Date;
}

export interface DefenseCategorySection {
  category: DefenseCategory;
  label: string;

  // --- Gerado do banco ---
  stock: {
    available: number;
    inUse: number;
    damaged: number;
    totalActive: number;
  };
  discards: {
    total: number;
    items: DefenseDiscardItem[];
    // Agrupamento por motivo (pra tabela "Motivo do descarte")
    byReason: { reason: string; count: number }[];
  };

  // Atribuições do período por INTENÇÃO (sub-categoria). É o que justifica
  // a compra pra diretoria: "X das Y atribuições foram Upgrade IFS".
  assignments: {
    total: number; // total de atribuições (→EmUso) da categoria no período
    withIntent: number; // quantas tinham intenção preenchida
    byIntent: {
      reason: 'AUMENTO_QUADRO' | 'SUBSTITUICAO';
      detail: string;
      count: number;
      pct: number; // % sobre o total de atribuições
    }[];
  };

  // --- Informado pelo usuário ---
  suggestedQuantity: number;
  queue: {
    newHires: number;
    replacement: number;
    total: number;
  };
  safetyStock: {
    quantity: number;
    rationale: string | null;
  };
  lastBatchQuantity: number;

  // Lista de chamados do Acelerato (comprovação — só All in One por ora).
  // Vazio/ausente = não exibe a grade de chamados no PDF.
  ticketNumbers: string[];

  // Economia negociada DESTA categoria (cada uma tem sua negociação)
  commercial: {
    discountPerUnit: number | null;
    discountLotSize: number | null;
    totalSavings: number | null; // desconto × lote
  };

  // --- Derivado ---
  // Soma fila + segurança (referência; o usuário é responsável por bater
  // com suggestedQuantity — não validamos por decisão de processo).
  composedTotal: number;
}

export interface DefenseAccessory {
  name: string;
  quantity: number;
  note: string | null;
}

// Seção agregada "Descarte e Doação — Parque Antigo" (todas as categorias).
// Descarte vem do banco; doação e "fora do padrão" são manuais.
export interface DefenseDisposalSection {
  totalProcessed: number; // descartes (banco) + doações (manual)
  discardTotal: number; // do banco — soma de todos os descartes do período
  donationQuantity: number; // manual
  outOfStandardQuantity: number; // manual — KPI fixo "Fora do Padrão"
  // % do total processado
  discardPct: number;
  donationPct: number;
  // Tabela de motivos (do banco, agrupado por motivo exato, com %)
  reasons: { reason: string; count: number; pct: number }[];
}

export interface PurchaseDefenseReport {
  meta: {
    periodStart: Date;
    periodEnd: Date;
    generatedAt: Date;
    generatedByName: string;
    generatedByRole: string;
  };
  sections: DefenseCategorySection[];
  disposal: DefenseDisposalSection | null;
  accessories: DefenseAccessory[];
  totals: {
    equipmentsTotal: number; // soma das sugestões de todas as categorias
    accessoriesTotal: number; // soma das quantidades de acessórios
    grandTotal: number; // equipamentos + acessórios
    totalSavings: number; // soma das economias de todas as categorias
  };
}

// ---------------------------------------------------------------------
// Coleta os dados do banco pra UMA categoria
// ---------------------------------------------------------------------

async function buildCategorySection(
  input: DefenseCategoryInput,
  periodStart: Date,
  periodEndInclusive: Date,
): Promise<DefenseCategorySection> {
  const category = input.category;

  const [stockGroups, discardRecords, assignmentsTotal, intentGroups] =
    await Promise.all([
      // Saldo atual: agrupa por status (só ativos não-arquivados)
      prisma.asset.groupBy({
        by: ['status'],
        where: { category, isArchived: false },
        _count: { status: true },
      }),
      // Descartes no período
      prisma.discardRecord.findMany({
        where: {
          category,
          discardedAt: { gte: periodStart, lte: periodEndInclusive },
        },
        select: {
          serialNumber: true,
          model: true,
          reason: true,
          discardedAt: true,
        },
        orderBy: { discardedAt: 'desc' },
      }),
      // Total de atribuições (→ EmUso) da categoria no período
      prisma.movementLog.count({
        where: {
          asset: { category },
          destinationStatus: 'EmUso',
          isVoided: false,
          timestamp: { gte: periodStart, lte: periodEndInclusive },
        },
      }),
      // Atribuições com intenção preenchida, agrupadas por motivo+intenção
      prisma.movementLog.groupBy({
        by: ['assignmentReason', 'assignmentReasonDetail'],
        where: {
          asset: { category },
          destinationStatus: 'EmUso',
          isVoided: false,
          assignmentReasonDetail: { not: null },
          timestamp: { gte: periodStart, lte: periodEndInclusive },
        },
        _count: { _all: true },
      }),
    ]);

  const stockBy = (status: 'Disponivel' | 'EmUso' | 'Danificado') =>
    stockGroups.find(
      (g: { status: string; _count: { status: number } }) =>
        g.status === status,
    )?._count.status ?? 0;

  const available = stockBy('Disponivel');
  const inUse = stockBy('EmUso');
  const damaged = stockBy('Danificado');

  // Agrupa descartes por motivo (texto livre — agrupa exato)
  const reasonMap = new Map<string, number>();
  for (const d of discardRecords) {
    reasonMap.set(d.reason, (reasonMap.get(d.reason) ?? 0) + 1);
  }
  const byReason = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // Atribuições por intenção (% sobre o total de atribuições do período)
  const byIntent = intentGroups
    .map(
      (g: {
        assignmentReason: 'AUMENTO_QUADRO' | 'SUBSTITUICAO' | null;
        assignmentReasonDetail: string | null;
        _count: { _all: number };
      }) => ({
        reason: g.assignmentReason,
        detail: g.assignmentReasonDetail ?? '',
        count: g._count._all,
        pct: assignmentsTotal > 0 ? (g._count._all / assignmentsTotal) * 100 : 0,
      }),
    )
    .filter(
      (
        g,
      ): g is {
        reason: 'AUMENTO_QUADRO' | 'SUBSTITUICAO';
        detail: string;
        count: number;
        pct: number;
      } => g.reason !== null && g.detail.length > 0,
    )
    .sort((a, b) => b.count - a.count);

  const withIntent = byIntent.reduce((sum, i) => sum + i.count, 0);

  const queueTotal = input.queueNewHires + input.queueReplacement;
  const composedTotal = queueTotal + input.safetyStockQuantity;

  // Economia desta categoria: desconto × lote (só se ambos informados)
  const dpu = input.discountPerUnit ?? null;
  const dls = input.discountLotSize ?? null;
  const catSavings = dpu != null && dls != null ? dpu * dls : null;

  return {
    category,
    label: defenseCategoryLabel(category),
    stock: {
      available,
      inUse,
      damaged,
      totalActive: available + inUse + damaged,
    },
    discards: {
      total: discardRecords.length,
      items: discardRecords.map((d) => ({
        serialNumber: d.serialNumber,
        model: d.model,
        reason: d.reason,
        discardedAt: d.discardedAt,
      })),
      byReason,
    },
    assignments: {
      total: assignmentsTotal,
      withIntent,
      byIntent,
    },
    suggestedQuantity: input.suggestedQuantity,
    queue: {
      newHires: input.queueNewHires,
      replacement: input.queueReplacement,
      total: queueTotal,
    },
    safetyStock: {
      quantity: input.safetyStockQuantity,
      rationale: input.safetyStockRationale ?? null,
    },
    lastBatchQuantity: input.lastBatchQuantity,
    ticketNumbers: input.ticketNumbers ?? [],
    commercial: {
      discountPerUnit: dpu,
      discountLotSize: dls,
      totalSavings: catSavings,
    },
    composedTotal,
  };
}

// ---------------------------------------------------------------------
// Monta a seção AGREGADA de Descarte e Doação (todas as categorias).
// Descarte vem do banco; doação e "fora do padrão" são manuais.
// ---------------------------------------------------------------------

async function buildDisposalSection(
  donationQuantity: number,
  outOfStandardQuantity: number,
  periodStart: Date,
  periodEndInclusive: Date,
): Promise<DefenseDisposalSection> {
  // Todos os descartes do período (todas as categorias de equipamento)
  const discards = await prisma.discardRecord.findMany({
    where: {
      category: { in: ['Notebook', 'Desktop', 'Celular', 'AllInOne'] },
      discardedAt: { gte: periodStart, lte: periodEndInclusive },
    },
    select: { reason: true },
  });

  const discardTotal = discards.length;
  const totalProcessed = discardTotal + donationQuantity;

  // Agrupa motivos (texto exato — sem normalização, por decisão)
  const reasonMap = new Map<string, number>();
  for (const d of discards) {
    reasonMap.set(d.reason, (reasonMap.get(d.reason) ?? 0) + 1);
  }
  const reasons = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      pct: totalProcessed > 0 ? (count / totalProcessed) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalProcessed,
    discardTotal,
    donationQuantity,
    outOfStandardQuantity,
    discardPct: totalProcessed > 0 ? (discardTotal / totalProcessed) * 100 : 0,
    donationPct:
      totalProcessed > 0 ? (donationQuantity / totalProcessed) * 100 : 0,
    reasons,
  };
}

// ---------------------------------------------------------------------
// Monta o relatório completo (categorias + disposal + acessórios)
// ---------------------------------------------------------------------

export async function generatePurchaseDefenseReport(
  input: PurchaseDefenseReportInput,
  actor: { fullName: string; role: string },
): Promise<PurchaseDefenseReport> {
  const periodEndInclusive = new Date(input.periodEnd);
  periodEndInclusive.setHours(23, 59, 59, 999);

  // Processa cada categoria selecionada (em paralelo)
  const sections = await Promise.all(
    input.categories.map((c) =>
      buildCategorySection(c, input.periodStart, periodEndInclusive),
    ),
  );

  // Seção agregada de descarte/doação (se informada)
  const disposal = input.disposal
    ? await buildDisposalSection(
        input.disposal.donationQuantity,
        input.disposal.outOfStandardQuantity,
        input.periodStart,
        periodEndInclusive,
      )
    : null;

  const accessories: DefenseAccessory[] = (input.accessories ?? []).map(
    (a) => ({ name: a.name, quantity: a.quantity, note: a.note ?? null }),
  );

  // Totais consolidados
  const equipmentsTotal = sections.reduce(
    (sum, s) => sum + s.suggestedQuantity,
    0,
  );
  const accessoriesTotal = accessories.reduce((sum, a) => sum + a.quantity, 0);
  // Economia total = soma das economias de cada categoria
  const totalSavings = sections.reduce(
    (sum, s) => sum + (s.commercial.totalSavings ?? 0),
    0,
  );

  return {
    meta: {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      generatedAt: new Date(),
      generatedByName: actor.fullName,
      generatedByRole: actor.role,
    },
    sections,
    disposal,
    accessories,
    totals: {
      equipmentsTotal,
      accessoriesTotal,
      grandTotal: equipmentsTotal + accessoriesTotal,
      totalSavings,
    },
  };
}
