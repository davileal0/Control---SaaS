import { PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma';
import { AuthUser } from '../middleware/auth';

// =====================================================================
// Pendências de periférico
// =====================================================================
// Item de chamado que não foi entregue na atribuição. Fica PENDENTE até
// ser entregue (dá baixa no estoque nesse momento) ou cancelada.

type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

/** Lista pendências. Por padrão, as PENDENTES primeiro (mais recentes). */
export async function listPendencies(status?: string) {
  return prisma.peripheralPendency.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
}

/**
 * Resolve uma pendência ENTREGANDO o periférico agora: debita `quantity`
 * unidades do estoque (Disponível → EmUso) e marca ENTREGUE. Se ainda
 * não houver estoque suficiente, bloqueia (continua pendente).
 */
export async function resolvePendency(id: number, actor: AuthUser) {
  return prisma.$transaction(async (tx: Tx) => {
    const pend = await tx.peripheralPendency.findUnique({ where: { id } });
    if (!pend) throw httpError('Pendência não encontrada.', 404);
    if (pend.status !== 'PENDENTE') {
      throw httpError('Esta pendência já foi resolvida ou cancelada.', 409);
    }

    const units = await tx.asset.findMany({
      where: {
        category: 'Periferico',
        model: pend.peripheralType,
        status: 'Disponivel',
        isArchived: false,
      },
      select: { serialNumber: true },
      orderBy: { createdAt: 'asc' },
      take: pend.quantity,
    });
    if (units.length < pend.quantity) {
      throw httpError(
        `Ainda sem estoque suficiente de "${pend.peripheralType}": ${units.length} de ${pend.quantity}. Reponha e tente de novo.`,
        409,
      );
    }

    for (const u of units) {
      await tx.asset.update({
        where: { serialNumber: u.serialNumber },
        data: { status: 'EmUso' },
      });
      await tx.movementLog.create({
        data: {
          assetSerialNumber: u.serialNumber,
          originStatus: 'Disponivel',
          destinationStatus: 'EmUso',
          ticketId: pend.ticketId,
          endUserName: pend.endUserName,
          unitName: pend.unitName,
          notes:
            `[PENDÊNCIA] Entrega tardia de periférico solicitado no chamado` +
            (pend.endUserName ? ` para ${pend.endUserName}` : ''),
          actorUserId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
        },
      });
    }

    return tx.peripheralPendency.update({
      where: { id },
      data: {
        status: 'ENTREGUE',
        resolvedByName: actor.name,
        resolvedAt: new Date(),
      },
    });
  });
}

/** Cancela uma pendência (não será mais entregue). */
export async function cancelPendency(id: number, actor: AuthUser) {
  const pend = await prisma.peripheralPendency.findUnique({ where: { id } });
  if (!pend) throw httpError('Pendência não encontrada.', 404);
  if (pend.status !== 'PENDENTE') {
    throw httpError('Esta pendência já foi resolvida ou cancelada.', 409);
  }
  return prisma.peripheralPendency.update({
    where: { id },
    data: {
      status: 'CANCELADA',
      resolvedByName: actor.name,
      resolvedAt: new Date(),
    },
  });
}
