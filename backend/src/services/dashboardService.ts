import { prisma } from '../db/prisma';

/**
 * Métricas do dashboard — SOMENTE ativos não arquivados.
 * Itens descartados (is_archived = true) jamais entram nesses contadores.
 *
 * Retorna:
 *  - byStatus: totais agregados (mantido pra compatibilidade)
 *  - byCategory: breakdown por categoria (Notebook, Celular, AllInOne...)
 *    com cada status separado. É o que alimenta os cards de DESTAQUE
 *    POR CATEGORIA no dashboard novo.
 *  - total: soma geral dos ativos
 *
 * Uma única query groupBy(category, status) faz o trabalho — o
 * agrupamento em memória é trivial.
 */
export async function getActiveMetrics() {
  const grouped = await prisma.asset.groupBy({
    by: ['category', 'status'],
    where: { isArchived: false },
    _count: { _all: true },
  });

  const byStatus = { Disponivel: 0, EmUso: 0, Danificado: 0 };
  const byCategory = {
    Notebook:   { Disponivel: 0, EmUso: 0, Danificado: 0 },
    Celular:    { Disponivel: 0, EmUso: 0, Danificado: 0 },
    AllInOne:   { Disponivel: 0, EmUso: 0, Danificado: 0 },
    Desktop:    { Disponivel: 0, EmUso: 0, Danificado: 0 },
    Periferico: { Disponivel: 0, EmUso: 0, Danificado: 0 },
  };

  for (const row of grouped) {
    const cat = row.category as keyof typeof byCategory;
    const sta = row.status as keyof typeof byStatus;
    if (byCategory[cat] && (sta in byStatus)) {
      byCategory[cat][sta] = row._count._all;
      byStatus[sta] += row._count._all;
    }
  }

  const total = byStatus.Disponivel + byStatus.EmUso + byStatus.Danificado;
  return { byStatus, byCategory, total };
}

/**
 * Consolidado de estoque agrupado por (categoria, model), só ativos.
 * Alimenta a visão gerencial do Líder e a distribuição do diretor.
 */
export async function getStockByModel() {
  const grouped = await prisma.asset.groupBy({
    by: ['category', 'model', 'status'],
    where: { isArchived: false },
    _count: { _all: true },
    orderBy: [{ category: 'asc' }, { model: 'asc' }],
  });

  return grouped.map((g: typeof grouped[number]) => ({
    category: g.category,
    model: g.model,
    status: g.status,
    count: g._count._all,
  }));
}

/**
 * Periféricos: breakdown por modelo COM status separado.
 * Em vez de só `count`, agora retorna available/inUse/damaged/total —
 * permite ordenar por estoque disponível pra mostrar os com MENOR
 * estoque (alertas operacionais para abrir SA).
 *
 * Conta apenas ativos (não arquivados) e categoria 'Periferico'.
 */
export async function getPeripheralBreakdown() {
  const grouped = await prisma.asset.groupBy({
    by: ['model', 'status'],
    where: { isArchived: false, category: 'Periferico' },
    _count: { _all: true },
  });

  // Agrupa por modelo, inicializando os 3 status com zeros
  const byModel: Record<string, { Disponivel: number; EmUso: number; Danificado: number }> = {};
  for (const row of grouped) {
    if (!byModel[row.model]) {
      byModel[row.model] = { Disponivel: 0, EmUso: 0, Danificado: 0 };
    }
    const sta = row.status as 'Disponivel' | 'EmUso' | 'Danificado';
    byModel[row.model][sta] = row._count._all;
  }

  const items = Object.entries(byModel)
    .map(([model, counts]) => ({
      model,
      available: counts.Disponivel,
      inUse: counts.EmUso,
      damaged: counts.Danificado,
      total: counts.Disponivel + counts.EmUso + counts.Danificado,
    }))
    .sort((a, b) => a.model.localeCompare(b.model));

  const total = items.reduce((sum, i) => sum + i.total, 0);
  return { total, items };
}
