// =====================================================================
// Activity Feed — feed de movimentações recentes pro dashboard
// =====================================================================
// Lê o MovementLog (append-only) e devolve um feed legível das últimas
// movimentações de TODOS os tipos (atribuição, devolução, assistência,
// descarte, ingestão).
//
// IMPORTANTE — sem autoria (decisão P1 / fase pré-SSO):
//   O MovementLog NÃO armazena quem executou a movimentação (não há
//   actorUserId/actorName). Por isso o feed mostra O QUE aconteceu com
//   o ativo, não QUEM fez. Quando o SSO entrar, adiciona-se a autoria
//   via migration + captura da sessão (igual MovementLogCorrection).
//
// O "tipo" da movimentação é DERIVADO da transição origin→destination,
// já que o schema não tem um campo explícito de tipo de evento.

import { prisma } from '../db/prisma';

export type MovementKind =
  | 'INGESTAO' // origin null → entrada no estoque
  | 'ATRIBUICAO' // Disponivel → EmUso (entregue a colaborador)
  | 'DEVOLUCAO' // EmUso → Disponivel (voltou ao estoque)
  | 'ENVIO_ASSISTENCIA' // * → Danificado (foi pra conserto)
  | 'RETORNO_ASSISTENCIA' // Danificado → Disponivel (consertado)
  | 'OUTRO'; // qualquer outra transição

export type ActivityFeedItem = {
  id: number;
  kind: MovementKind;
  timestamp: string;
  // Dados do ativo
  serialNumber: string;
  model: string;
  category: string;
  // Detalhes da movimentação (todos opcionais — dependem do tipo)
  endUserName: string | null;
  managerName: string | null;
  department: string | null;
  ticketId: string | null;
  invoiceNumber: string | null;
  trackingCode: string | null;
  notes: string | null;
  assignmentReason: string | null;
  // Sub-categoria/intenção da atribuição (quando houver)
  assignmentReasonDetail: string | null;
  // Estados crus (pra UI que queira mostrar)
  originStatus: string | null;
  destinationStatus: string;
  // Flag de anulação (logs anulados aparecem riscados/marcados)
  isVoided: boolean;
};

/** Deriva o tipo de movimentação a partir da transição de status. */
function deriveKind(
  origin: string | null,
  destination: string,
): MovementKind {
  if (origin === null) return 'INGESTAO';
  if (origin === 'Disponivel' && destination === 'EmUso') return 'ATRIBUICAO';
  if (origin === 'EmUso' && destination === 'Disponivel') return 'DEVOLUCAO';
  if (destination === 'Danificado') return 'ENVIO_ASSISTENCIA';
  if (origin === 'Danificado' && destination === 'Disponivel')
    return 'RETORNO_ASSISTENCIA';
  return 'OUTRO';
}

/**
 * Retorna as movimentações mais recentes pro feed do dashboard.
 *
 * IMPORTANTE: ingestão (cadastro de ativo) NÃO é movimentação. Uma
 * movimentação é uma AÇÃO sobre um ativo que já existe no parque
 * (atribuir, devolver, reaproveitar, enviar pra assistência, descartar).
 * O cadastro inicial — onde originStatus é null — é a ENTRADA do ativo,
 * não uma movimentação. Por isso filtramos `originStatus: { not: null }`
 * direto na query: o feed de movimentações nunca conhece ingestões.
 *
 * @param limit quantidade de itens (default 6 pro card; mais pra "ver todas")
 */
export async function getActivityFeed(limit = 6): Promise<ActivityFeedItem[]> {
  const logs = await prisma.movementLog.findMany({
    where: {
      // Exclui ingestão (cadastro). Movimentação = ação sobre ativo existente.
      originStatus: { not: null },
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
    include: {
      asset: {
        select: { model: true, category: true },
      },
    },
  });

  return logs.map((log: (typeof logs)[number]) => ({
    id: log.id,
    kind: deriveKind(log.originStatus, log.destinationStatus),
    timestamp: log.timestamp.toISOString(),
    serialNumber: log.assetSerialNumber,
    model: log.asset.model,
    category: log.asset.category,
    endUserName: log.endUserName,
    managerName: log.managerName,
    department: log.department,
    ticketId: log.ticketId,
    invoiceNumber: log.invoiceNumber,
    trackingCode: log.trackingCode,
    notes: log.notes,
    assignmentReason: log.assignmentReason,
    assignmentReasonDetail: log.assignmentReasonDetail,
    originStatus: log.originStatus,
    destinationStatus: log.destinationStatus,
    isVoided: log.isVoided,
  }));
}

/**
 * Movimentações de HOJE (a partir do início do dia). Usa exatamente o
 * mesmo filtro do KPI "Movimentações hoje" (exclui ingestão e descarte),
 * pra que a lista do painel bata com o número do card. Inclui a
 * sub-categoria/intenção quando houver.
 */
export async function getTodayMovements(): Promise<ActivityFeedItem[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const logs = await prisma.movementLog.findMany({
    where: {
      // Espelha o MOVEMENT_FILTER do metricsService: sem ingestão nem
      // descarte. O OR mantém movimentações com notes nulo (senão o
      // `NOT (notes LIKE '[DESCARTE]%')` viraria NULL e as excluiria).
      originStatus: { not: null },
      OR: [
        { notes: null },
        { NOT: { notes: { startsWith: '[DESCARTE]' } } },
      ],
      timestamp: { gte: start },
    },
    orderBy: { timestamp: 'desc' },
    include: {
      asset: {
        select: { model: true, category: true },
      },
    },
  });

  return logs.map((log: (typeof logs)[number]) => ({
    id: log.id,
    kind: deriveKind(log.originStatus, log.destinationStatus),
    timestamp: log.timestamp.toISOString(),
    serialNumber: log.assetSerialNumber,
    model: log.asset.model,
    category: log.asset.category,
    endUserName: log.endUserName,
    managerName: log.managerName,
    department: log.department,
    ticketId: log.ticketId,
    invoiceNumber: log.invoiceNumber,
    trackingCode: log.trackingCode,
    notes: log.notes,
    assignmentReason: log.assignmentReason,
    assignmentReasonDetail: log.assignmentReasonDetail,
    originStatus: log.originStatus,
    destinationStatus: log.destinationStatus,
    isVoided: log.isVoided,
  }));
}
