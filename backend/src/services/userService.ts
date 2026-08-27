import { prisma } from '../db/prisma';
import { Prisma } from '@prisma/client';
import { CreateUserInput, UpdateUserInput } from '../validation/schemas';
import { AuthUser } from '../middleware/auth';

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

// =====================================================================
// Gerenciamento de usuários
// =====================================================================
// A tabela `users` responde "o que essa pessoa pode fazer aqui dentro?"
// — o SSO corporativo é quem responde "quem é essa pessoa?".
//
// Quando alguém autentica em produção, o backend pega o e-mail do JWT
// do SSO e procura aqui pelo `role`. Se não encontrar (ou se estiver
// inativo), o acesso é negado.
//
// REMOÇÃO É LÓGICA (isActive=false) e nunca física. A
// `movement_log_corrections` referencia `actorUserId` — apagar o
// usuário quebraria o histórico imutável de quem corrigiu o quê.
//
// AUDITORIA: toda ação de acesso (criar, mudar papel, desativar,
// reativar) grava um registro IMUTÁVEL em access_logs, com quem fez,
// quem foi afetado, o que mudou e quando. É a "separação de
// responsabilidades" que a auditoria exige — o painel de gestão de
// acessos só é defensável com essa trilha.
//
// SALVAGUARDAS: um gestor não pode rebaixar/desativar a si mesmo, e não
// se pode desativar/rebaixar o ÚLTIMO gestor ativo (senão ninguém mais
// administra a plataforma).

const GESTORES = ['LIDER_N1', 'DIRETOR_TI'] as const;

/** Lista todos os usuários, ativos primeiro, ordenados por nome. */
export async function listUsers() {
  return prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
  });
}

/** Conta gestores ativos (Líder ou Coordenador). Salvaguarda anti-lockout. */
async function countActiveGestores(): Promise<number> {
  return prisma.user.count({
    where: { isActive: true, role: { in: [...GESTORES] } },
  });
}

/** Cria um novo usuário. O e-mail precisa ser único. */
export async function createUser(input: CreateUserInput, actor: AuthUser) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw httpError('Já existe um usuário com este e-mail.', 409);
  }

  // Cria o usuário e grava a trilha de auditoria numa transação — nunca
  // um sem o outro.
  return prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        role: input.role,
      },
    });

    await tx.accessLog.create({
      data: {
        action: 'CREATE',
        targetUserId: created.id,
        targetEmail: created.email,
        changes: { role: { before: null, after: created.role } },
        actorUserId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
      },
    });

    return created;
  });
}

/** Atualiza papel e/ou status ativo de um usuário existente. */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: AuthUser,
) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw httpError('Usuário não encontrado.', 404);
  }

  const data: { role?: typeof user.role; isActive?: boolean } = {};
  if (input.role !== undefined) data.role = input.role;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  if (Object.keys(data).length === 0) {
    throw httpError('Nenhum campo informado para atualização.', 422);
  }

  // ----- SALVAGUARDAS (anti-lockout / auto-sabotagem) -----

  const isSelf = actor.id === user.id;
  const willDeactivate = data.isActive === false;
  const willDemote =
    data.role !== undefined &&
    !(GESTORES as readonly string[]).includes(data.role) &&
    (GESTORES as readonly string[]).includes(user.role);

  // 1) Não pode desativar/rebaixar a si mesmo (evita se trancar fora).
  if (isSelf && willDeactivate) {
    throw httpError('Você não pode desativar o seu próprio acesso.', 422);
  }
  if (isSelf && willDemote) {
    throw httpError('Você não pode rebaixar o seu próprio papel.', 422);
  }

  // 2) Não pode remover o ÚLTIMO gestor ativo (senão ninguém administra).
  const targetIsActiveGestor =
    user.isActive && (GESTORES as readonly string[]).includes(user.role);
  if (targetIsActiveGestor && (willDeactivate || willDemote)) {
    const activeGestores = await countActiveGestores();
    if (activeGestores <= 1) {
      throw httpError(
        'Este é o último gestor ativo. Promova ou ative outro gestor antes de alterar este acesso.',
        422,
      );
    }
  }

  // ----- Monta o diff pra trilha de auditoria -----
  const changes: Prisma.InputJsonValue = {};
  const changesObj = changes as Record<
    string,
    { before: unknown; after: unknown }
  >;
  if (data.role !== undefined && data.role !== user.role) {
    changesObj.role = { before: user.role, after: data.role };
  }
  if (data.isActive !== undefined && data.isActive !== user.isActive) {
    changesObj.isActive = { before: user.isActive, after: data.isActive };
  }

  // Determina a ação pro log (prioriza a mudança de status).
  let action: 'ROLE_CHANGE' | 'DEACTIVATE' | 'REACTIVATE' | null = null;
  if (changesObj.isActive) {
    action = data.isActive ? 'REACTIVATE' : 'DEACTIVATE';
  } else if (changesObj.role) {
    action = 'ROLE_CHANGE';
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id }, data });

    // Só grava log se algo de fato mudou (evita ruído por no-op).
    if (action) {
      await tx.accessLog.create({
        data: {
          action,
          targetUserId: user.id,
          targetEmail: user.email,
          changes,
          actorUserId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
        },
      });
    }

    return updated;
  });
}

/** Lista a trilha de auditoria de acessos (mais recente primeiro). */
export async function listAccessLogs(limit = 200) {
  return prisma.accessLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
