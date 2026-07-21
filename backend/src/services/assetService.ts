import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { prisma } from '../db/prisma';
import { CreateAssetInput, ListFiltersInput } from '../validation/schemas';
import { autoCloseIfStockNormalized } from './purchaseRequestService';
import { parseSerials } from './serialParser';
import { AuthUser } from '../middleware/auth';
import { actorFields } from './logActor';

// Type alias pro callback de $transaction (5.x não expõe TransactionClient
// diretamente; isso funciona em todas as versões).
type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Gera um SN sintético pra periférico cadastrado em massa.
 *
 * Formato: <TIPO_UPPERCASE>-<6 hex chars>  ex: "MOUSE-A3F8D2"
 *
 * Não é UUID porque queremos identificação visual rápida quando aparece
 * em audit logs: dá pra inferir o tipo só batendo o olho. 6 hex chars
 * = 16M combinações — colisão prática nula.
 *
 * Sanitiza o tipo (remove acentos/espaços) pra ficar URL/CSV-safe.
 */
function generateSyntheticSerial(peripheralType: string): string {
  const sanitized = peripheralType
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20);
  const suffix = randomBytes(3).toString('hex').toUpperCase(); // 6 chars
  return `${sanitized}-${suffix}`;
}

/**
 * Cadastra ativo(s). Comporta 2 modos detectados pelo schema:
 *   1. INDIVIDUAL (Notebook/Celular/AllInOne/Desktop): cria 1 asset
 *      com o SN e model fornecidos.
 *   2. BULK (Periférico): cria N assets com SNs sintéticos. Operador
 *      passa apenas `peripheralType` e `quantity`.
 *
 * Retorno:
 *   - Modo individual: { mode: 'individual', asset }
 *   - Modo bulk:       { mode: 'bulk', count, type }
 */
export async function createAsset(input: CreateAssetInput, actor: AuthUser) {
  if (input.category === 'Periferico') {
    return createPeripheralsBulk(input.peripheralType!, input.quantity!, actor);
  }
  return createIndividualAsset(
    input.serialNumber!,
    input.model!,
    input.category,
    actor,
  );
}

// ---------------------------------------------------------------------
// MODO 1 — Individual (não-periférico)
// ---------------------------------------------------------------------

async function createIndividualAsset(
  serialNumber: string,
  model: string,
  category: 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne',
  actor: AuthUser,
) {
  const exists = await prisma.asset.findUnique({
    where: { serialNumber },
  });
  if (exists) {
    throw Object.assign(
      new Error('Já existe um ativo com este número de série.'),
      { statusCode: 409 },
    );
  }

  const asset = await prisma.$transaction(async (tx: Tx) => {
    const created = await tx.asset.create({
      data: {
        serialNumber,
        model,
        category,
        status: 'Disponivel',
      },
    });

    await tx.movementLog.create({
      data: {
        assetSerialNumber: created.serialNumber,
        originStatus: null,
        destinationStatus: 'Disponivel',
        notes: '[INGESTÃO] Cadastro inicial do ativo.',
        ...actorFields(actor),
      },
    });

    return created;
  });

  // Hook auto-close pra SCs pendentes do alvo
  await tryAutoCloseAfterStockChange(asset);

  return { mode: 'individual' as const, asset };
}

// ---------------------------------------------------------------------
// MODO 2 — Bulk (periférico em massa)
// ---------------------------------------------------------------------

async function createPeripheralsBulk(
  peripheralType: string,
  quantity: number,
  actor: AuthUser,
) {
  // Gera SNs sintéticos antes da transação (createMany não retorna IDs).
  // Em caso EXTREMAMENTE raro de colisão (~1 em 16M por SN), Prisma
  // levanta P2002 (unique constraint) e o operador refaz — aceitável.
  const serials = Array.from({ length: quantity }, () =>
    generateSyntheticSerial(peripheralType),
  );

  await prisma.$transaction(async (tx: Tx) => {
    // Cria N assets de uma vez
    await tx.asset.createMany({
      data: serials.map((sn) => ({
        serialNumber: sn,
        model: peripheralType,
        category: 'Periferico' as const,
        status: 'Disponivel' as const,
      })),
    });

    // Cria N logs de ingestão. createMany NÃO suporta relações
    // automáticas, mas como `assetSerialNumber` é a FK direta, funciona.
    await tx.movementLog.createMany({
      data: serials.map((sn) => ({
        assetSerialNumber: sn,
        originStatus: null,
        destinationStatus: 'Disponivel' as const,
        notes: `[INGESTÃO MASSIVA] Cadastro de ${quantity} ${peripheralType.toLowerCase()}(s).`,
        ...actorFields(actor),
      })),
    });
  });

  // Hook auto-close: pra periféricos chamamos uma vez só pro tipo
  // (não N vezes — seria redundante). Recalcula estoque e fecha SC se
  // aplicável.
  await tryAutoCloseAfterStockChange({
    category: 'Periferico',
    model: peripheralType,
  });

  return { mode: 'bulk' as const, count: quantity, type: peripheralType };
}

// ---------------------------------------------------------------------
// MODO 3 — Equipamento em massa (lista de SNs colada)
// ---------------------------------------------------------------------
// Cadastro avulso de N equipamentos do MESMO modelo/categoria, a partir
// de uma lista de SNs colada (planilha). Mesma dinâmica do recebimento
// de SC, mas SEM SC: categoria e modelo vêm do operador (não de uma SC).
//
// Reusa o parseSerials (mesmo parser do recebimento). Pula SNs já
// existentes avisando (não bloqueia o resto). Retorna relatório.

export type EquipmentBulkResult = {
  mode: 'equipment-bulk';
  created: number;
  skippedExisting: number;
  skippedExistingSerials: string[];
  duplicatesInPaste: number;
  skippedLines: number;
  model: string;
  category: string;
};

async function createEquipmentsBulk(
  category: 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne',
  model: string,
  serials: string[],
  actor: AuthUser,
): Promise<EquipmentBulkResult> {
  // Verifica quais SNs já existem (pula duplicadas — não bloqueia)
  const existing = await prisma.asset.findMany({
    where: { serialNumber: { in: serials } },
    select: { serialNumber: true },
  });
  const existingSet = new Set(
    existing.map((e: { serialNumber: string }) => e.serialNumber),
  );
  const toCreate = serials.filter((sn) => !existingSet.has(sn));
  const skippedExisting = serials.filter((sn) => existingSet.has(sn));

  if (toCreate.length === 0) {
    throw Object.assign(
      new Error(
        `Todas as ${serials.length} SNs já existem no estoque. Nada a criar.`,
      ),
      { statusCode: 409 },
    );
  }

  await prisma.$transaction(async (tx: Tx) => {
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
        notes: `[INGESTÃO MASSIVA] Cadastro de ${toCreate.length} ${model}.`,
        ...actorFields(actor),
      })),
    });
  });

  // Hook auto-close (uma vez pro alvo — não N vezes)
  await tryAutoCloseAfterStockChange({ category, model });

  return {
    mode: 'equipment-bulk',
    created: toCreate.length,
    skippedExisting: skippedExisting.length,
    skippedExistingSerials: skippedExisting,
    duplicatesInPaste: 0, // preenchido pelo chamador (que tem o parsed)
    skippedLines: 0,
    model,
    category,
  };
}

/**
 * Cadastro de equipamentos em massa a partir de texto colado (SNs).
 * Faz o parsing, valida e delega pra createEquipmentsBulk.
 */
export async function createEquipmentsBulkFromRaw(
  category: 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne',
  model: string,
  serialNumbersRaw: string,
  actor: AuthUser,
): Promise<EquipmentBulkResult> {
  const parsed = parseSerials(serialNumbersRaw);
  if (parsed.serials.length === 0) {
    throw Object.assign(
      new Error('Nenhuma SN válida encontrada no texto colado.'),
      { statusCode: 422 },
    );
  }
  const result = await createEquipmentsBulk(
    category,
    model,
    parsed.serials,
    actor,
  );
  // Completa o relatório com dados do parsing
  return {
    ...result,
    duplicatesInPaste: parsed.duplicatesInPaste.length,
    skippedLines: parsed.skippedLines,
  };
}

/**
 * Recalcula estoque pro alvo do asset criado/devolvido e chama
 * auto-close se há SC pendente que pode ser apaziguada.
 *
 * Dispara DUAS verificações por asset (uma pra category, outra pra
 * peripheral_model quando aplicável), porque a SC pode ter sido aberta
 * em qualquer das duas granularidades.
 */
export async function tryAutoCloseAfterStockChange(asset: {
  category: string;
  model: string;
}) {
  // Conta disponíveis na categoria
  const categoryAvailable = await prisma.asset.count({
    where: {
      category: asset.category as 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne' | 'Periferico',
      status: 'Disponivel',
      isArchived: false,
    },
  });
  await autoCloseIfStockNormalized(
    'CATEGORY',
    asset.category,
    categoryAvailable,
  );

  // Pra periféricos: conta disponíveis no MODEL (que é o granular usado)
  if (asset.category === 'Periferico') {
    const modelAvailable = await prisma.asset.count({
      where: {
        model: asset.model,
        status: 'Disponivel',
        isArchived: false,
      },
    });
    await autoCloseIfStockNormalized(
      'PERIPHERAL_MODEL',
      asset.model,
      modelAvailable,
    );
  }
}

/**
 * Lista ativos ativos (não arquivados), com filtros opcionais.
 *
 * Cada item retornado inclui o ÚLTIMO log não-anulado para alimentar a
 * coluna "Onde está" da listagem (mostra colaborador/setor para itens
 * Em Uso). A busca casa em:
 *   - serialNumber (case-insensitive)
 *   - model (case-insensitive)
 *   - endUserName de QUALQUER log não-anulado (case-insensitive)
 *
 * Limitação conhecida do search: encontra ativos onde a pessoa pesquisada
 * já esteve associada, mesmo que não seja a atual. Para o operador, basta
 * abrir o painel de detalhe e olhar o badge de status para distinguir.
 */
export async function listActiveAssets(filters: ListFiltersInput = {}) {
  const { status, category, search } = filters;

  // Constrói o where condicionalmente, deixando o Prisma inferir o tipo.
  // Evita depender de Prisma.AssetWhereInput (mudou entre versões do
  // client) ou de manipular tipos genéricos.
  const searchOR =
    search && search.trim()
      ? {
          OR: [
            { serialNumber: { contains: search.trim(), mode: 'insensitive' as const } },
            { model: { contains: search.trim(), mode: 'insensitive' as const } },
            {
              movementLogs: {
                some: {
                  endUserName: { contains: search.trim(), mode: 'insensitive' as const },
                  isVoided: false,
                },
              },
            },
          ],
        }
      : {};

  return prisma.asset.findMany({
    where: {
      isArchived: false,
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...searchOR,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      movementLogs: {
        where: { isVoided: false },
        orderBy: { timestamp: 'desc' },
        take: 1,
      },
    },
  });
}
