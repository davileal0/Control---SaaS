import { prisma } from '../db/prisma';
import { PurchaseJustificationFilters } from '../validation/schemas';
import { Category } from '../domain/types';

// =====================================================================
// Relatório de Justificativa de Compra
// =====================================================================
// Coleta os dados estruturados que sustentam o argumento "precisamos
// comprar X equipamentos". Toda métrica é rastreável e baseada em fatos
// do banco — nada de opinião do operador.
//
// Saída é um objeto rico que alimenta:
//   - O PDF (pra apresentação visual em reunião)
//   - O XLSX (pra contabilidade detalhar)
//   - A tela (se um dia a gente exibir um preview)
// =====================================================================

/** Marca textual que identifica logs gerados por reaproveitamento. */
const REUSE_PREFIX = '[REUTILIZAÇÃO]';

/**
 * Grupos de defeitos pra agregação qualitativa. Os notes do operador são
 * texto livre, então usamos um pequeno léxico controlado: cada nota é
 * lida em lowercase e contabilizada UMA vez por grupo onde casar
 * qualquer padrão (mesmo se vários casarem). Não é classificação
 * científica — dá uma noção sólida do padrão.
 */
const DEFECT_GROUPS: ReadonlyArray<{ label: string; patterns: readonly string[] }> = [
  { label: 'Tela / display', patterns: ['tela', 'display', 'lcd', 'monitor', 'écran'] },
  { label: 'Bateria / carga', patterns: ['bateria', 'pilha', 'carregar', 'carga', 'autonomia'] },
  { label: 'Teclado', patterns: ['teclado', 'tecla'] },
  { label: 'Placa-mãe', patterns: ['placa-mãe', 'placa mãe', 'placa mae', 'motherboard'] },
  { label: 'Fonte / carregador', patterns: ['fonte', 'carregador', 'adaptador'] },
  { label: 'Armazenamento (HD/SSD)', patterns: [' hd ', 'ssd', 'disco rígido', 'disco rigido', 'm.2', 'nvme'] },
  { label: 'Memória / RAM', patterns: ['memória', 'memoria', ' ram '] },
  { label: 'Refrigeração', patterns: ['cooler', 'ventilador', 'fan', 'superaquec', 'esquentand'] },
  { label: 'Tampa / dobradiça', patterns: ['dobradiça', 'dobradica', 'dobradiças', 'tampa'] },
  { label: 'Câmera / áudio', patterns: ['webcam', 'câmera', 'camera', 'microfone', 'áudio', 'audio', 'som', 'alto-falante'] },
  { label: 'Travamento / lentidão', patterns: ['travand', 'travament', 'lento', 'lentidão', 'lentidao', 'congelad'] },
  { label: 'Conectividade (USB/HDMI/rede)', patterns: ['usb', 'hdmi', 'wifi', 'wi-fi', 'rede', 'porta'] },
  { label: 'Quebra física', patterns: ['quebrad', 'rachad', 'trincad', 'amassad', 'caiu'] },
];

// Tipos do payload retornado — usados também pelos serviços de PDF/XLSX

export interface PurchaseJustificationReport {
  meta: {
    category: Category;
    periodStart: Date;
    periodEnd: Date;
    generatedAt: Date;
    generatedByName: string;
    generatedByRole: string;
  };
  currentStock: {
    available: number;
    inUse: number;
    damaged: number;
    totalActive: number;
    isCritical: boolean;
  };
  movements: {
    assignments: number;
    returns: number;
    reassignments: number;
    byMonth: { month: string; assignments: number; returns: number; reassignments: number }[];
  };
  discards: {
    total: number;
    items: { serialNumber: string; model: string; reason: string; discardedAt: Date; discardedByName: string }[];
  };
  breakdownsAndRepairs: {
    sentToRepair: number;
    returnedRepaired: number;
    condemnedAfterRepair: number;
    frequentDefects: { label: string; count: number }[];
    topDamageSectors: { department: string; count: number }[];
  };
  distributionBySector: { department: string; count: number }[];
  byModel?: { model: string; count: number }[];
  recommendation: {
    quantity: number;
    summary: string;
  };
}

// ---------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------

function countByKey<T>(items: T[], keyFn: (i: T) => string | null | undefined) {
  const acc: Record<string, number> = {};
  for (const it of items) {
    const k = keyFn(it);
    if (k) acc[k] = (acc[k] ?? 0) + 1;
  }
  return acc;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isReuseLog(notes: string | null | undefined): boolean {
  return !!notes && notes.startsWith(REUSE_PREFIX);
}

function classifyDefects(notesArray: string[]): { label: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const note of notesArray) {
    const lower = ` ${note.toLowerCase()} `;
    for (const group of DEFECT_GROUPS) {
      if (group.patterns.some((p) => lower.includes(p))) {
        counts[group.label] = (counts[group.label] ?? 0) + 1;
      }
    }
  }
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function categoryLabel(category: Category): string {
  return (
    { Notebook: 'notebooks', Desktop: 'desktops', Celular: 'celulares', AllInOne: 'All-in-Ones', Periferico: 'periféricos' } as const
  )[category];
}

// ---------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------

export async function generatePurchaseJustification(
  filters: PurchaseJustificationFilters,
  actor: { fullName: string; role: string },
): Promise<PurchaseJustificationReport> {
  const { category, periodStart, periodEnd } = filters;
  // Inclui o último dia inteiro no período (até 23:59:59.999)
  const periodEndInclusive = new Date(periodEnd);
  periodEndInclusive.setHours(23, 59, 59, 999);

  // === Consultas paralelas — agrupadas em 3 lotes pra TS inferir
  // os tipos como tuplas (mais de 8 itens em uma Promise.all faz
  // o TS cair em array genérico).
  const [stockGroups, assignmentLogs, returnLogs, reassignLogs] = await Promise.all([
    // 1) Saldo atual: agrupa por status (só ativos não-arquivados)
    prisma.asset.groupBy({
      by: ['status'],
      where: { category, isArchived: false },
      _count: { status: true },
    }),
    // 2) Atribuições no período (Disponivel→EmUso, qualquer notes)
    prisma.movementLog.findMany({
      where: {
        isVoided: false,
        originStatus: 'Disponivel',
        destinationStatus: 'EmUso',
        timestamp: { gte: periodStart, lte: periodEndInclusive },
        asset: { category },
      },
      select: { timestamp: true, notes: true },
    }),
    // 3) Devoluções no período (EmUso→Disponivel) — vamos filtrar
    //    reaproveitamentos em memória
    prisma.movementLog.findMany({
      where: {
        isVoided: false,
        originStatus: 'EmUso',
        destinationStatus: 'Disponivel',
        timestamp: { gte: periodStart, lte: periodEndInclusive },
        asset: { category },
      },
      select: { timestamp: true, notes: true },
    }),
    // 4) Reaproveitamentos: contamos só o "destino EmUso"
    prisma.movementLog.findMany({
      where: {
        isVoided: false,
        destinationStatus: 'EmUso',
        notes: { startsWith: REUSE_PREFIX },
        timestamp: { gte: periodStart, lte: periodEndInclusive },
        asset: { category },
      },
      select: { timestamp: true },
    }),
  ]);

  const [damageLogs, repairLogs, discardRecords] = await Promise.all([
    // 5) Quebras: logs *→Danificado (qualquer origem)
    prisma.movementLog.findMany({
      where: {
        isVoided: false,
        destinationStatus: 'Danificado',
        timestamp: { gte: periodStart, lte: periodEndInclusive },
        asset: { category },
      },
      select: { notes: true, originStatus: true, department: true },
    }),
    // 6) Reparos voltados: Danificado→Disponivel
    prisma.movementLog.findMany({
      where: {
        isVoided: false,
        originStatus: 'Danificado',
        destinationStatus: 'Disponivel',
        timestamp: { gte: periodStart, lte: periodEndInclusive },
        asset: { category },
      },
      select: { timestamp: true },
    }),
    // 7) Descartes no período
    prisma.discardRecord.findMany({
      where: {
        category,
        discardedAt: { gte: periodStart, lte: periodEndInclusive },
      },
      select: {
        serialNumber: true,
        model: true,
        reason: true,
        lastStatus: true,
        discardedAt: true,
        discardedByName: true,
      },
      orderBy: { discardedAt: 'desc' },
    }),
  ]);

  // 8) Ativos em uso (pra distribuição por setor)
  const inUseAssetsWithDept = await prisma.asset.findMany({
    where: { category, status: 'EmUso', isArchived: false },
    select: {
      serialNumber: true,
      movementLogs: {
        where: { isVoided: false, destinationStatus: 'EmUso' },
        orderBy: { timestamp: 'desc' },
        take: 1,
        select: { department: true },
      },
    },
  });

  // 9) Distribuição por modelo (só relevante pra Periféricos)
  const byModelGroups =
    category === 'Periferico'
      ? await prisma.asset.groupBy({
          by: ['model'],
          where: { category, isArchived: false },
          _count: { model: true },
          orderBy: { _count: { model: 'desc' } },
        })
      : [];

  // === Processamento ===

  // Saldo atual
  const stockBy = (status: 'Disponivel' | 'EmUso' | 'Danificado') =>
    stockGroups.find((g) => g.status === status)?._count.status ?? 0;
  const available = stockBy('Disponivel');
  const inUse = stockBy('EmUso');
  const damaged = stockBy('Danificado');
  const totalActive = available + inUse + damaged;
  // Saldo crítico: disponível menor que o que sai (descartes recentes + danificados atuais)
  const isCritical = available < damaged + discardRecords.length;

  // Movimentações: separa devoluções reais de reaproveitamentos
  const reassignmentsCount = reassignLogs.length;
  const realReturnsCount = returnLogs.filter((l) => !isReuseLog(l.notes)).length;

  // Por mês (intercalado)
  const monthBuckets = new Map<string, { assignments: number; returns: number; reassignments: number }>();
  const ensure = (k: string) => {
    if (!monthBuckets.has(k)) monthBuckets.set(k, { assignments: 0, returns: 0, reassignments: 0 });
    return monthBuckets.get(k)!;
  };
  for (const l of assignmentLogs) ensure(monthKey(l.timestamp)).assignments++;
  for (const l of returnLogs) if (!isReuseLog(l.notes)) ensure(monthKey(l.timestamp)).returns++;
  for (const l of reassignLogs) ensure(monthKey(l.timestamp)).reassignments++;
  const byMonth = Array.from(monthBuckets.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));

  // Quebras: separa origem e prepara classificação
  const sentToRepair = damageLogs.length;
  const returnedRepaired = repairLogs.length;
  const condemnedAfterRepair = discardRecords.filter((d) => d.lastStatus === 'Danificado').length;

  // Defeitos: junta notes de quebras + descartes (lastStatus=Danificado)
  const defectNotes: string[] = [];
  for (const l of damageLogs) if (l.notes) defectNotes.push(l.notes);
  for (const d of discardRecords)
    if (d.lastStatus === 'Danificado' && d.reason) defectNotes.push(d.reason);
  const frequentDefects = classifyDefects(defectNotes);

  // Setores que mais danificam: só logs EmUso→Danificado
  const fromInUseDamage = damageLogs.filter(
    (l: { originStatus: string | null }) => l.originStatus === 'EmUso',
  );
  const topDamageSectors = Object.entries(
    countByKey(fromInUseDamage, (l: { department: string | null }) => l.department),
  )
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);

  // Distribuição por setor (entre os ativos atualmente EmUso)
  const distributionBySector = Object.entries(
    countByKey(
      inUseAssetsWithDept,
      (a: { movementLogs: { department: string | null }[] }) =>
        a.movementLogs[0]?.department,
    ),
  )
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);

  // By model (Periféricos)
  const byModel =
    category === 'Periferico'
      ? byModelGroups.map((g) => ({ model: g.model, count: g._count.model }))
      : undefined;

  // Quantidade SOLICITADA: informada pelo Líder/Coordenador (não mais
  // calculada pelo sistema). Eles julgam quantos repor — inclusive
  // considerando que o equipamento demora 30–40 dias pra chegar, então
  // pedir pouco não compensa. Os dados abaixo (descartes, danificados,
  // saldo) seguem no texto como EMBASAMENTO do pedido.
  const quantity = filters.quantity;

  const catWord = categoryLabel(category);
  const summary =
    `Foram descartados ${discardRecords.length} ${catWord} no período analisado, ` +
    `e há ${damaged} em assistência sem previsão de retorno. O saldo disponível ` +
    `atual (${available} unidades) é ${isCritical ? 'insuficiente' : 'apertado'} ` +
    `para reposição. Considerando o prazo de reposição (30 a 40 dias até a ` +
    `chegada dos equipamentos), solicita-se a aquisição de ${quantity} ${catWord}.`;

  return {
    meta: {
      category,
      periodStart,
      periodEnd: periodEndInclusive,
      generatedAt: new Date(),
      generatedByName: actor.fullName,
      generatedByRole: actor.role,
    },
    currentStock: { available, inUse, damaged, totalActive, isCritical },
    movements: {
      assignments: assignmentLogs.length,
      returns: realReturnsCount,
      reassignments: reassignmentsCount,
      byMonth,
    },
    discards: {
      total: discardRecords.length,
      items: discardRecords.map((d) => ({
        serialNumber: d.serialNumber,
        model: d.model,
        reason: d.reason,
        discardedAt: d.discardedAt,
        discardedByName: d.discardedByName,
      })),
    },
    breakdownsAndRepairs: {
      sentToRepair,
      returnedRepaired,
      condemnedAfterRepair,
      frequentDefects,
      topDamageSectors,
    },
    distributionBySector,
    byModel,
    recommendation: {
      quantity,
      summary,
    },
  };
}

export { categoryLabel };
