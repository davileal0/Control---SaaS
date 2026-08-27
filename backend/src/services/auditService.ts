import { prisma } from '../db/prisma';

/**
 * Linha do tempo de auditoria de um ativo específico. Retorna o ativo
 * (mesmo arquivado) e todos os seus logs em ordem cronológica.
 * Esta é a única superfície onde itens arquivados aparecem.
 */
export async function getAuditTimeline(serial: string) {
  const asset = await prisma.asset.findUnique({
    where: { serialNumber: serial },
    include: {
      currentUnit: { select: { id: true, name: true } },
      movementLogs: {
        orderBy: { timestamp: 'asc' },
        include: {
          // A trilha de correções de cada lançamento acompanha a jornada.
          corrections: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });

  if (!asset) {
    throw Object.assign(new Error('Nenhum ativo encontrado para este número de série.'), {
      statusCode: 404,
    });
  }

  return asset;
}
