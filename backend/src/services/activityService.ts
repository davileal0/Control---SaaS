import { prisma } from '../db/prisma';
import { Prisma } from '@prisma/client';

// =====================================================================
// Serviço de Atividade dos Operadores (Painel de Atividade — Fase 2)
// =====================================================================
// Leitura/agregação pura sobre o MovementLog (que agora guarda o autor).
// NÃO é ranking nem nota — só os fatos, pro supervisor interpretar e
// conduzir feedback individual baseado em evidência.
//
// Só considera logs COM autor (actorUserId não-nulo). Logs antigos, sem
// autor, ficam de fora naturalmente (não dá pra atribuir a ninguém).
// Também exclui logs anulados (isVoided) — ação desfeita não conta.

// Classificação da ação a partir dos campos do log. Reusa os mesmos
// padrões que o resto da plataforma usa (originStatus + prefixo notes).
export type ActionType =
  | 'cadastro' // ingestão (originStatus null)
  | 'atribuicao' // → EmUso
  | 'devolucao' // EmUso → Disponivel
  | 'descarte' // [DESCARTE]
  | 'outro'; // qualquer outra transição

interface RawLog {
  originStatus: string | null;
  destinationStatus: string;
  notes: string | null;
  timestamp: Date;
}

export function classifyAction(log: RawLog): ActionType {
  if (log.notes?.startsWith('[DESCARTE]')) return 'descarte';
  if (log.originStatus === null) return 'cadastro';
  if (log.destinationStatus === 'EmUso') return 'atribuicao';
  if (log.originStatus === 'EmUso' && log.destinationStatus === 'Disponivel')
    return 'devolucao';
  return 'outro';
}

export interface OperatorActivitySummary {
  actorUserId: string;
  actorName: string;
  actorRole: string;
  total: number;
  byType: Record<ActionType, number>;
  lastActivity: Date | null;
  // Atividade por dia no período (pro mini-gráfico). Chave: YYYY-MM-DD.
  dailyCounts: { date: string; count: number }[];
}

/** Resumo de atividade de TODOS os operadores no período. */
export async function getTeamActivity(
  periodStart: Date,
  periodEnd: Date,
): Promise<OperatorActivitySummary[]> {
  // Fim do período INCLUSIVO sem depender do fuso do servidor: em vez de
  // setHours(23,59) (que usa o fuso local e desloca em UTC), somamos 1 dia
  // ao fim e usamos "< dia seguinte". Cobre o dia inteiro do periodEnd
  // independente de fuso.
  const endExclusive = new Date(periodEnd);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const logs = await prisma.movementLog.findMany({
    where: {
      actorUserId: { not: null },
      isVoided: false,
      timestamp: { gte: periodStart, lt: endExclusive },
    },
    select: {
      actorUserId: true,
      actorName: true,
      actorRole: true,
      originStatus: true,
      destinationStatus: true,
      notes: true,
      timestamp: true,
    },
    orderBy: { timestamp: 'asc' },
  });

  // Agrupa por operador
  const map = new Map<string, OperatorActivitySummary>();

  for (const log of logs) {
    const id = log.actorUserId as string;
    let op = map.get(id);
    if (!op) {
      op = {
        actorUserId: id,
        actorName: log.actorName ?? '(sem nome)',
        actorRole: log.actorRole ?? '',
        total: 0,
        byType: {
          cadastro: 0,
          atribuicao: 0,
          devolucao: 0,
          descarte: 0,
          outro: 0,
        },
        lastActivity: null,
        dailyCounts: [],
      };
      map.set(id, op);
    }

    const type = classifyAction(log);
    op.total += 1;
    op.byType[type] += 1;
    if (!op.lastActivity || log.timestamp > op.lastActivity) {
      op.lastActivity = log.timestamp;
    }
  }

  // Monta a contagem diária por operador (segunda passada, já agrupado)
  const dailyMap = new Map<string, Map<string, number>>();
  for (const log of logs) {
    const id = log.actorUserId as string;
    const day = log.timestamp.toISOString().slice(0, 10);
    if (!dailyMap.has(id)) dailyMap.set(id, new Map());
    const d = dailyMap.get(id)!;
    d.set(day, (d.get(day) ?? 0) + 1);
  }
  for (const [id, days] of dailyMap) {
    const op = map.get(id);
    if (op) {
      op.dailyCounts = Array.from(days.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  }

  // Ordena por nome (NÃO por volume — evita a leitura de "ranking")
  return Array.from(map.values()).sort((a, b) =>
    a.actorName.localeCompare(b.actorName),
  );
}

export interface ActivityLogEntry {
  id: number;
  type: ActionType;
  assetSerialNumber: string;
  destinationStatus: string;
  endUserName: string | null;
  notes: string | null;
  timestamp: Date;
}

/** Extrato individual: histórico de ações de UM operador no período. */
export async function getOperatorActivity(
  actorUserId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<{
  actorName: string;
  actorRole: string;
  entries: ActivityLogEntry[];
}> {
  const endExclusive = new Date(periodEnd);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const logs = await prisma.movementLog.findMany({
    where: {
      actorUserId,
      isVoided: false,
      timestamp: { gte: periodStart, lt: endExclusive },
    },
    orderBy: { timestamp: 'desc' },
  });

  const entries: ActivityLogEntry[] = logs.map(
    (log: {
      id: number;
      assetSerialNumber: string;
      originStatus: string | null;
      destinationStatus: string;
      endUserName: string | null;
      notes: string | null;
      timestamp: Date;
    }) => ({
      id: log.id,
      type: classifyAction(log),
      assetSerialNumber: log.assetSerialNumber,
      destinationStatus: log.destinationStatus,
      endUserName: log.endUserName,
      notes: log.notes,
      timestamp: log.timestamp,
    }),
  );

  return {
    actorName: logs[0]?.actorName ?? '',
    actorRole: logs[0]?.actorRole ?? '',
    entries,
  };
}
