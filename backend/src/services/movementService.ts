import { prisma } from '../db/prisma';
import { Prisma } from '@prisma/client';
import { assertTransition } from '../domain/assetStateMachine';
import { AssetStatus } from '../domain/types';
import {
  TransitionInput,
  DiscardInput,
  EditMovementInput,
  VoidMovementInput,
  ReassignInput,
} from '../validation/schemas';
import { AuthUser } from '../middleware/auth';

const EDITABLE_FIELDS = [
  'ticketId',
  'endUserName',
  'managerName',
  'department',
  'invoiceNumber',
  'trackingCode',
  'notes',
] as const;

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Executa uma transição de status do ativo e grava o log de movimentação
 * na MESMA transação.
 */
export async function registerMovement(
  serial: string,
  input: TransitionInput,
  actor: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { serialNumber: serial } });
    if (!asset || asset.isArchived) {
      throw httpError('Ativo não encontrado ou arquivado.', 404);
    }

    const from = asset.status as AssetStatus;
    const to = input.destinationStatus;

    assertTransition(from, to, {
      ticketId: input.ticketId,
      endUserName: input.endUserName,
      managerName: input.managerName,
      department: input.department,
    });

    await tx.asset.update({ where: { serialNumber: serial }, data: { status: to } });

    return tx.movementLog.create({
      data: {
        assetSerialNumber: serial,
        originStatus: from,
        destinationStatus: to,
        ticketId: input.ticketId,
        endUserName: input.endUserName,
        managerName: input.managerName,
        department: input.department,
        invoiceNumber: input.invoiceNumber,
        trackingCode: input.trackingCode,
        notes: input.notes,
        // Só persiste se for transição pra EmUso (validado no Zod;
        // garantia extra aqui pra não poluir outros logs).
        assignmentReason: to === 'EmUso' ? input.assignmentReason : null,
        actorUserId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
      },
    });
  });
}

/**
 * Edita os metadados de um lançamento (engano de digitação, chamado
 * trocado etc.). NÃO altera o trajeto de status. Cada edição:
 *   - exige justificativa;
 *   - registra um diff campo-a-campo imutável em corrections;
 *   - atribui a autoria ao usuário autenticado (SSO), nunca ao corpo.
 */
export async function editMovement(
  logId: number,
  input: EditMovementInput,
  actor: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    const log = await tx.movementLog.findUnique({ where: { id: logId } });
    if (!log) throw httpError('Lançamento não encontrado.', 404);
    if (log.isVoided) throw httpError('Lançamento anulado não pode ser editado.', 409);

    // Monta o diff apenas dos campos efetivamente alterados.
    const changes: Prisma.InputJsonValue = {};
    const changesObj = changes as Record<
      string,
      { before: unknown; after: unknown }
    >;
    const data: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in input.fields) {
        const after = (input.fields as Record<string, unknown>)[field] ?? null;
        const before = (log as Record<string, unknown>)[field] ?? null;
        if (after !== before) {
          changesObj[field] = { before, after };
          data[field] = after;
        }
      }
    }

    if (Object.keys(changesObj).length === 0) {
      throw httpError('Nenhuma alteração detectada nos campos informados.', 422);
    }

    const updated = await tx.movementLog.update({ where: { id: logId }, data });

    await tx.movementLogCorrection.create({
      data: {
        movementLogId: logId,
        operation: 'EDIT',
        reason: input.reason,
        changes,
        actorUserId: actor.id,
        actorName: actor.email, // nome completo viria do diretório; e-mail como fallback
        actorRole: actor.role,
      },
    });

    return updated;
  });
}

/**
 * Remoção lógica (anulação) de um lançamento feito por engano. A linha
 * permanece no banco (is_voided = true) e some das visões operacionais,
 * mas a anulação fica documentada e visível aos supervisores.
 */
export async function voidMovement(
  logId: number,
  input: VoidMovementInput,
  actor: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    const log = await tx.movementLog.findUnique({ where: { id: logId } });
    if (!log) throw httpError('Lançamento não encontrado.', 404);
    if (log.isVoided) throw httpError('Lançamento já está anulado.', 409);

    const updated = await tx.movementLog.update({
      where: { id: logId },
      data: { isVoided: true, voidedAt: new Date() },
    });

    await tx.movementLogCorrection.create({
      data: {
        movementLogId: logId,
        operation: 'VOID',
        reason: input.reason,
        actorUserId: actor.id,
        actorName: actor.email,
        actorRole: actor.role,
      },
    });

    return updated;
  });
}

/**
 * Descarte definitivo: exclusão lógica do ativo (is_archived = true) com
 * justificativa obrigatória. Além do log de movimentação, grava um
 * snapshot em discard_records para a "Planilha de equipamentos
 * descartados".
 */
export async function discardAsset(
  serial: string,
  input: DiscardInput,
  actor: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { serialNumber: serial } });
    if (!asset || asset.isArchived) {
      throw httpError('Ativo não encontrado ou já arquivado.', 404);
    }

    await tx.asset.update({
      where: { serialNumber: serial },
      data: { isArchived: true },
    });

    const log = await tx.movementLog.create({
      data: {
        assetSerialNumber: serial,
        originStatus: asset.status,
        destinationStatus: asset.status,
        notes: `[DESCARTE] ${input.notes}`,
        actorUserId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
      },
    });

    // Snapshot para exportação em planilha.
    await tx.discardRecord.create({
      data: {
        serialNumber: asset.serialNumber,
        model: asset.model,
        category: asset.category,
        lastStatus: asset.status,
        reason: input.notes,
        discardedByUserId: actor.id,
        discardedByName: actor.email,
      },
    });

    return log;
  });
}

/**
 * Reaproveitamento direto: mesma máquina muda de colaborador sem voltar
 * fisicamente ao estoque. Cria DOIS lançamentos atômicos na mesma
 * transação:
 *
 *   1) Devolução do colaborador anterior (EmUso → Disponivel)
 *   2) Nova atribuição ao colaborador novo (Disponivel → EmUso)
 *
 * Ambos com prefixo [REUTILIZAÇÃO] nas observações pra identificação
 * visual na timeline. O `status` final do ativo continua EmUso — os
 * logs documentam a transição conceitual, não o estado intermediário.
 *
 * A atomicidade aqui é crítica pra integridade da auditoria: se o Log 2
 * falhasse, o Postgres reverte o Log 1 automaticamente. Nunca fica
 * registro de devolução sem destino, nem o oposto.
 */
export async function reassignAsset(
  serial: string,
  input: ReassignInput,
  actor: AuthUser,
) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { serialNumber: serial } });
    if (!asset || asset.isArchived) {
      throw httpError('Ativo não encontrado ou arquivado.', 404);
    }
    if (asset.status !== 'EmUso') {
      throw httpError(
        'Apenas ativos em uso podem ser reaproveitados.',
        409,
      );
    }

    // Validação dos campos da nova atribuição (idênticos ao Fluxo A).
    assertTransition('Disponivel', 'EmUso', {
      ticketId: input.newTicketId,
      endUserName: input.endUserName,
      managerName: input.managerName,
      department: input.department,
    });

    // Identifica o colaborador anterior pra deixar registrado no Log 1
    // e referenciado no Log 2.
    const lastAssignment = await tx.movementLog.findFirst({
      where: {
        assetSerialNumber: serial,
        isVoided: false,
        destinationStatus: 'EmUso',
      },
      orderBy: { timestamp: 'desc' },
    });

    const previousUserLabel =
      lastAssignment?.endUserName ?? 'colaborador anterior';
    const extraNotes = input.notes ? `. ${input.notes}` : '';

    // Log 1: devolução do anterior. O ativo é creditado de volta ao
    // colaborador anterior pra manter a referência da devolução clara.
    const returnLog = await tx.movementLog.create({
      data: {
        assetSerialNumber: serial,
        originStatus: 'EmUso',
        destinationStatus: 'Disponivel',
        ticketId: input.returnTicketId,
        endUserName: lastAssignment?.endUserName,
        managerName: lastAssignment?.managerName,
        department: lastAssignment?.department,
        notes:
          `[REUTILIZAÇÃO] Devolução de ${previousUserLabel} redirecionada ` +
          `para reaproveitamento — equipamento não retornou ao estoque ` +
          `físico${extraNotes}`,
        actorUserId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
      },
    });

    // Log 2: nova atribuição. Mesmo ativo, novo colaborador.
    const newAssignmentLog = await tx.movementLog.create({
      data: {
        assetSerialNumber: serial,
        originStatus: 'Disponivel',
        destinationStatus: 'EmUso',
        ticketId: input.newTicketId,
        endUserName: input.endUserName,
        managerName: input.managerName,
        department: input.department,
        // Só a nova atribuição carrega o motivo; a devolução não.
        assignmentReason: input.assignmentReason,
        notes:
          `[REUTILIZAÇÃO] Reaproveitamento da máquina anteriormente em uso ` +
          `por ${previousUserLabel}${extraNotes}`,
        actorUserId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
      },
    });

    // O asset.status continua EmUso (estado inicial == estado final).
    // Não há UPDATE necessário no asset — os logs registram a transição
    // conceitual completa, e o estado final é coerente.

    return { returnLog, newAssignmentLog };
  });
}
