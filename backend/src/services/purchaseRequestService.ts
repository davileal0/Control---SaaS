import { PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma';
import { AuthUser } from '../middleware/auth';
import { actorFields } from './logActor';
import { LOW_STOCK_THRESHOLD } from './stockThresholds';
import { parseSerials } from './serialParser';

// Type alias pro callback de $transaction (mesma técnica do assetService:
// 5.x não expõe TransactionClient diretamente).
type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
import type {
  AuthorizePurchaseRequestInput,
  ClosePurchaseRequestInput,
  OpenPurchaseRequestInput,
  PurchaseRequestFilters,
} from '../validation/schemas';

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

// =====================================================================
// Solicitações de Compra (SC) — service
// =====================================================================
// Fluxo completo:
//   1. Líder/Diretor autoriza (cria SC em AGUARDANDO_ABERTURA)
//   2. Heryck (Operador N1) ou superior registra o número emitido pelo
//      sistema da Unifique → status vira ABERTA
//   3. Quando o pedido chega: alguém fecha manualmente → FECHADA
//      (com motivo MANUAL)
//   OU
//   3'. Se estoque normalizar ENQUANTO ainda está AGUARDANDO_ABERTURA
//       (= ninguém abriu na Unifique ainda): auto-fecha (STOCK_NORMALIZED)
//   OU
//   3''. Cancelamento manual em qualquer estado: → CANCELADA
//
// Regra crítica (D4 do alinhamento):
//   Se SC já foi ABERTA, NÃO auto-fecha por normalização de estoque.
//   A compra já foi mandada pro setor de Compras da Unifique. Equipamento
//   extra que esteja chegando por devolução é separado da SC ativa.

/** Lista todas as SCs, com filtros opcionais. Ordenadas por mais recente. */
export async function listPurchaseRequests(filters: PurchaseRequestFilters) {
  return prisma.purchaseRequest.findMany({
    where: {
      ...(filters.status && { status: filters.status }),
      ...(filters.targetValue && {
        targetValue: { contains: filters.targetValue, mode: 'insensitive' },
      }),
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Retorna a SC ATIVA pra um alvo (AGUARDANDO_ABERTURA ou ABERTA). */
export async function findActiveRequestFor(
  targetKind: 'CATEGORY' | 'PERIPHERAL_MODEL',
  targetValue: string,
) {
  return prisma.purchaseRequest.findFirst({
    where: {
      targetKind,
      targetValue,
      status: { in: ['AGUARDANDO_ABERTURA', 'ABERTA'] },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Autoriza uma nova SC. Falha se já houver SC ativa pro mesmo alvo
 * (evita duplicação acidental — operador deve fechar/cancelar a
 * existente antes de abrir nova).
 */
export async function authorizePurchaseRequest(
  input: AuthorizePurchaseRequestInput,
  actor: AuthUser,
) {
  const existing = await findActiveRequestFor(
    input.targetKind,
    input.targetValue,
  );
  if (existing) {
    throw httpError(
      `Já existe uma SC ativa pra "${input.targetValue}" (status: ${existing.status}). Feche ou cancele antes de autorizar nova.`,
      409,
    );
  }

  return prisma.purchaseRequest.create({
    data: {
      targetKind: input.targetKind,
      targetValue: input.targetValue,
      quantity: input.quantity,
      // Modelo só pra equipamento (CATEGORY); periférico fica null
      equipmentModel:
        input.targetKind === 'CATEGORY' ? input.equipmentModel : null,
      status: 'AGUARDANDO_ABERTURA',
      authorizedByUserId: actor.id,
      authorizedByName: actor.email,
      authorizedByRole: actor.role,
      notes: input.notes,
    },
  });
}

/**
 * Registra o número da SC (Heryck abre no sistema da Unifique e
 * volta pra Control). Só permite a transição AGUARDANDO_ABERTURA → ABERTA.
 */
export async function openPurchaseRequest(
  id: string,
  input: OpenPurchaseRequestInput,
  actor: AuthUser,
) {
  const pr = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!pr) throw httpError('SC não encontrada.', 404);
  if (pr.status !== 'AGUARDANDO_ABERTURA') {
    throw httpError(
      `Não é possível abrir uma SC com status ${pr.status}.`,
      409,
    );
  }

  return prisma.purchaseRequest.update({
    where: { id },
    data: {
      status: 'ABERTA',
      scNumber: input.scNumber,
      openedByUserId: actor.id,
      openedByName: actor.email,
      openedByRole: actor.role,
      openedAt: new Date(),
      // Anexa a nota da abertura à nota original (preserva contexto)
      notes:
        input.notes && pr.notes
          ? `${pr.notes}\n--- abertura: ${input.notes}`
          : input.notes ?? pr.notes,
    },
  });
}

/**
 * Fecha (manual) ou cancela uma SC. Estado destino depende do `reason`:
 *   - MANUAL    → FECHADA (recebimento normal)
 *   - CANCELED  → CANCELADA (correção de erro/desistência)
 *
 * RECEBIMENTO DE EQUIPAMENTO (Opção 1):
 *   Quando reason=MANUAL + serialNumbersRaw presente + SC é de
 *   equipamento (targetKind=CATEGORY com equipmentModel), o fechamento
 *   também CRIA os ativos a partir das SNs coladas (planilha do
 *   almoxarifado) — numa única transação com o fechamento da SC.
 *   O modelo é herdado da SC; a categoria vem do targetValue.
 *   Tolera divergência de quantidade (A3) e pula SNs duplicadas (D2).
 *
 * Permite fechar a partir de qualquer estado ATIVO (AGUARDANDO_ABERTURA
 * ou ABERTA). Estados terminais (FECHADA/CANCELADA) não podem ser
 * "refechados".
 */
export async function closePurchaseRequest(
  id: string,
  input: ClosePurchaseRequestInput,
  actor: AuthUser,
) {
  // Autorização fina por motivo (o middleware deixou os 3 papéis
  // passarem; aqui aplicamos a regra real):
  //   - CANCELED (decisão/aval): Líder + Coordenador (DIRETOR_TI).
  //     Coordenador pode cancelar pra cobrir ausência do Líder.
  //     Operador NÃO cancela (não é dele a decisão de aval).
  //   - MANUAL (recebimento/operação): Operador + Líder.
  //     Coordenador é somente-leitura e NÃO opera (fechar cria ativos).
  if (input.reason === 'CANCELED') {
    if (actor.role !== 'LIDER_N1' && actor.role !== 'DIRETOR_TI') {
      throw httpError('Seu perfil não pode cancelar uma SC.', 403);
    }
  } else {
    // MANUAL
    if (actor.role !== 'OPERADOR_N1' && actor.role !== 'LIDER_N1') {
      throw httpError('Seu perfil não pode dar entrada/fechar uma SC.', 403);
    }
  }

  const pr = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!pr) throw httpError('SC não encontrada.', 404);
  if (pr.status === 'FECHADA' || pr.status === 'CANCELADA') {
    throw httpError(`SC já está ${pr.status}.`, 409);
  }

  const finalStatus = input.reason === 'CANCELED' ? 'CANCELADA' : 'FECHADA';

  // Caminho 1: cancelamento ou fechamento simples (sem SNs).
  // Mantém o comportamento original — não cria ativos.
  const hasSerials =
    input.reason === 'MANUAL' &&
    typeof input.serialNumbersRaw === 'string' &&
    input.serialNumbersRaw.trim().length > 0;

  if (!hasSerials) {
    const updated = await prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: finalStatus,
        closedByUserId: actor.id,
        closedByName: actor.email,
        closedByRole: actor.role,
        closedAt: new Date(),
        closeReason: input.reason,
        notes:
          input.notes && pr.notes
            ? `${pr.notes}\n--- fechamento: ${input.notes}`
            : input.notes ?? pr.notes,
      },
    });
    return { request: updated, receiving: null };
  }

  // Caminho 2: recebimento de equipamento com entrada no estoque.
  // Só faz sentido pra SC de equipamento (CATEGORY) com modelo definido.
  if (pr.targetKind !== 'CATEGORY' || !pr.equipmentModel) {
    throw httpError(
      'Recebimento com SNs só se aplica a SC de equipamento com modelo definido. Pra periférico, feche sem lista de SNs.',
      422,
    );
  }

  const category = pr.targetValue as
    | 'Notebook'
    | 'Celular'
    | 'AllInOne'
    | 'Desktop';
  const model = pr.equipmentModel;

  // Parseia o texto colado → SNs limpas (sem cabeçalho/vazias/dups internas)
  const parsed = parseSerials(input.serialNumbersRaw!);

  if (parsed.serials.length === 0) {
    throw httpError(
      'Nenhuma SN válida encontrada no texto colado. Verifique o conteúdo.',
      422,
    );
  }

  // Verifica quais SNs já existem no banco (não cria duplicadas — D2)
  const existing = await prisma.asset.findMany({
    where: { serialNumber: { in: parsed.serials } },
    select: { serialNumber: true },
  });
  const existingSet = new Set(
    existing.map((e: { serialNumber: string }) => e.serialNumber),
  );
  const toCreate = parsed.serials.filter((sn) => !existingSet.has(sn));
  const skippedExisting = parsed.serials.filter((sn) => existingSet.has(sn));

  if (toCreate.length === 0) {
    throw httpError(
      `Todas as ${parsed.serials.length} SNs já existem no estoque. Nada a criar.`,
      409,
    );
  }

  // Transação: cria ativos + logs de ingestão + fecha a SC juntos.
  const scNote = pr.scNumber ? ` (SC ${pr.scNumber})` : '';
  const updated = await prisma.$transaction(async (tx: Tx) => {
    await tx.asset.createMany({
      data: toCreate.map((sn) => ({
        serialNumber: sn,
        model,
        category,
        status: 'Disponivel' as const,
      })),
    });

    await tx.movementLog.createMany({
      data: toCreate.map((sn) => ({
        assetSerialNumber: sn,
        originStatus: null,
        destinationStatus: 'Disponivel' as const,
        notes: `[INGESTÃO RECEBIMENTO]${scNote} ${model} — entrada via fechamento de SC.`,
        ...actorFields(actor),
      })),
    });

    return tx.purchaseRequest.update({
      where: { id },
      data: {
        status: finalStatus,
        closedByUserId: actor.id,
        closedByName: actor.email,
        closedByRole: actor.role,
        closedAt: new Date(),
        closeReason: input.reason,
        notes:
          input.notes && pr.notes
            ? `${pr.notes}\n--- fechamento: ${input.notes}`
            : input.notes ?? pr.notes,
      },
    });
  });

  // Relatório do recebimento pra UI mostrar o resultado
  const receiving = {
    created: toCreate.length,
    skippedExisting: skippedExisting.length,
    skippedExistingSerials: skippedExisting,
    duplicatesInPaste: parsed.duplicatesInPaste.length,
    skippedLines: parsed.skippedLines,
    expectedQuantity: pr.quantity,
    quantityMismatch: toCreate.length !== pr.quantity,
    model,
    category,
  };

  return { request: updated, receiving };
}

/**
 * Hook chamado APÓS qualquer operação que aumente o estoque disponível
 * (criação de novo Asset, devolução de equipamento etc).
 *
 * Verifica se há SC AGUARDANDO_ABERTURA pra esse alvo. Se sim, e o
 * estoque agora está acima do threshold, fecha automaticamente com
 * motivo STOCK_NORMALIZED.
 *
 * IMPORTANTE: NÃO auto-fecha SC ABERTA — regra D4 do alinhamento.
 * Quando a SC já foi formalizada no setor de Compras da Unifique, ela
 * tem que ser fechada manualmente quando os equipamentos chegarem.
 *
 * `availableCount` é passado pelo chamador pra evitar uma query extra
 * (chamador já recalculou estoque após sua operação).
 */
export async function autoCloseIfStockNormalized(
  targetKind: 'CATEGORY' | 'PERIPHERAL_MODEL',
  targetValue: string,
  availableCount: number,
) {
  if (availableCount <= LOW_STOCK_THRESHOLD) return null;

  // Pega APENAS SC em AGUARDANDO_ABERTURA — ABERTA fica imune ao auto-close
  const pending = await prisma.purchaseRequest.findFirst({
    where: {
      targetKind,
      targetValue,
      status: 'AGUARDANDO_ABERTURA',
    },
  });
  if (!pending) return null;

  return prisma.purchaseRequest.update({
    where: { id: pending.id },
    data: {
      status: 'FECHADA',
      closedAt: new Date(),
      closeReason: 'STOCK_NORMALIZED',
      // closedBy* ficam null — auto-close não tem actor humano
    },
  });
}
