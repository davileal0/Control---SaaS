import { prisma } from '../db/prisma';
import { CreateUnitInput, UpdateUnitInput } from '../validation/schemas';

// =====================================================================
// Unidades físicas (filiais)
// =====================================================================
// Lista gerenciada em Configurações (Líder/Diretor criam e ativam/
// desativam). Todo usuário autenticado LÊ (pra selecionar em cadastro e
// movimentações). Unidade nunca é apagada — desativada (isActive=false)
// pra preservar referências históricas.

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

/** Lista unidades. Por padrão só as ativas; includeInactive traz todas. */
export async function listUnits(includeInactive = false) {
  return prisma.unit.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}

export async function createUnit(input: CreateUnitInput) {
  const name = input.name.trim();
  const exists = await prisma.unit.findUnique({ where: { name } });
  if (exists) {
    throw httpError('Já existe uma unidade com esse nome.', 409);
  }
  return prisma.unit.create({ data: { name } });
}

export async function updateUnit(id: string, input: UpdateUnitInput) {
  const unit = await prisma.unit.findUnique({ where: { id } });
  if (!unit) throw httpError('Unidade não encontrada.', 404);

  // Renome exige unicidade.
  if (input.name !== undefined) {
    const name = input.name.trim();
    const clash = await prisma.unit.findFirst({
      where: { name, id: { not: id } },
    });
    if (clash) throw httpError('Já existe uma unidade com esse nome.', 409);
  }

  return prisma.unit.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}
