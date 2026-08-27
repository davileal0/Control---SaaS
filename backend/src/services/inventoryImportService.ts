import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { prisma } from '../db/prisma';
import { AuthUser } from '../middleware/auth';

// =====================================================================
// Importação de Inventário — FASE 1: parser + validador
// =====================================================================
// Lê a planilha oficial do inventário de TI e valida CADA linha contra
// as regras por categoria. NÃO persiste nada — só diz se está tudo
// válido ou devolve a lista de erros (linha + motivo), pro operador
// corrigir e reenviar. A criação dos ativos é da Fase 2.
//
// Planilha esperada (cabeçalho na 1ª linha):
//   Categoria de equipamento | Equipamento | Marca | SN | Modelo | Quantidade | IMEI
//
// Regras por categoria:
//   Notebook/Desktop → identificador = SN. model = "Marca Modelo". 1 linha = 1 ativo.
//   Celular          → identificador = IMEI. model = "Marca Modelo". SN opcional/descartado.
//   Periferico       → sem identificador. model = "Equipamento Marca". qtd = N ativos.

// Categorias aceitas na planilha → enum Category do Prisma.
const CATEGORY_MAP: Record<string, 'Notebook' | 'Desktop' | 'Celular' | 'Periferico'> = {
  notebook: 'Notebook',
  desktop: 'Desktop',
  celular: 'Celular',
  smartphone: 'Celular', // sinônimo aceito
  periferico: 'Periferico',
  periférico: 'Periferico', // com acento
};

// Colunas esperadas (ordem do cabeçalho). Normalizamos por nome, não por
// posição fixa, pra tolerar pequenas variações de ordem.
const COLUMNS = {
  categoria: ['categoria de equipamento', 'categoria'],
  equipamento: ['equipamento'],
  marca: ['marca'],
  sn: ['sn', 'serial', 'número de série', 'numero de serie'],
  modelo: ['modelo'],
  quantidade: ['quantidade', 'qtd'],
  imei: ['imei'],
};

export interface ParsedAsset {
  category: 'Notebook' | 'Desktop' | 'Celular' | 'Periferico';
  identifier: string | null; // SN ou IMEI (null para periférico)
  model: string; // nome final montado
  quantity: number; // 1 para itens com série; N para periférico
  rowNumber: number; // linha na planilha (pra rastreio)
}

export interface RowError {
  row: number;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: RowError[];
  assets: ParsedAsset[]; // preenchido só se valid === true
  summary: {
    totalRows: number;
    totalAssets: number; // considerando quantidade dos periféricos
    byCategory: Record<string, number>;
  };
}

/** Normaliza texto de célula: string aparada, ou '' se vazio/nulo. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    // ExcelJS pode devolver rich text / hyperlink / formula result
    const anyVal = value as { text?: string; result?: unknown };
    if (typeof anyVal.text === 'string') return anyVal.text.trim();
    if (anyVal.result !== undefined) return String(anyVal.result).trim();
    return '';
  }
  return String(value).trim();
}

/** Mapeia o cabeçalho da planilha pras colunas conhecidas (por nome). */
function mapHeader(headerRow: ExcelJS.Row): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const name = cellText(cell.value).toLowerCase();
    for (const [key, aliases] of Object.entries(COLUMNS)) {
      if (aliases.includes(name)) {
        map[key] = colNumber;
      }
    }
  });
  return map;
}

/** Um arquivo .xlsx é um ZIP: começa com a assinatura "PK" (0x50 0x4B). */
function isXlsxBuffer(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/**
 * Detecta o separador de um CSV a partir da 1ª linha. Aceita ";", ","
 * e tab — CSVs gerados pelo Excel em pt-BR costumam usar ";".
 */
function detectDelimiter(firstLine: string): string {
  const counts: Record<string, number> = {
    ';': (firstLine.match(/;/g) ?? []).length,
    ',': (firstLine.match(/,/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Decodifica o buffer de um CSV para texto, lidando com as codificações
 * que aparecem na prática. O Excel em pt-BR salva CSV em Windows-1252
 * (ANSI) por padrão, não em UTF-8 — então "Periférico" (é = 0xE9) não é
 * UTF-8 válido e precisa do fallback, senão o acento vira "�".
 *
 * Ordem: BOM explícito (UTF-8 / UTF-16) → UTF-8 estrito → Windows-1252.
 * O TextDecoder remove o BOM sozinho; ignoreBOM fica no padrão (false).
 */
function decodeCsv(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer);
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  // Sem BOM: tenta UTF-8 estrito; se houver byte inválido, cai pra Windows-1252.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/**
 * Carrega o buffer enviado como um worksheet do ExcelJS, aceitando tanto
 * .xlsx quanto .csv. O tipo é detectado pelo conteúdo (não pela extensão,
 * que não é confiável). Toda a validação a jusante opera sobre o worksheet,
 * então o resto do fluxo não muda entre os dois formatos.
 */
async function loadInventoryWorksheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();

  if (isXlsxBuffer(buffer)) {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } else {
    // CSV: decodifica detectando a codificação (UTF-8 / Windows-1252).
    const text = decodeCsv(buffer);
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const delimiter = detectDelimiter(firstLine);
    await wb.csv.read(Readable.from(text), {
      parserOptions: { delimiter },
      // Mantém cada célula como string crua: evita que SN/IMEI numéricos
      // percam zeros à esquerda ou virem número, e que datas sejam reparseadas.
      map: (datum: string) => datum,
    });
  }

  return wb.worksheets[0];
}

/**
 * Parseia e valida a planilha. Recebe o buffer do arquivo enviado (.xlsx
 * ou .csv). Retorna a lista de erros (se houver) ou os ativos prontos (se
 * válido).
 */
export async function parseAndValidateInventory(
  buffer: Buffer,
): Promise<ValidationResult> {
  const errors: RowError[] = [];

  let ws: ExcelJS.Worksheet | undefined;
  try {
    ws = await loadInventoryWorksheet(buffer);
  } catch {
    return {
      valid: false,
      errors: [
        {
          row: 0,
          message: 'Arquivo inválido ou corrompido. Envie um .xlsx ou .csv válido.',
        },
      ],
      assets: [],
      summary: { totalRows: 0, totalAssets: 0, byCategory: {} },
    };
  }

  if (!ws || ws.rowCount < 2) {
    return {
      valid: false,
      errors: [{ row: 0, message: 'Planilha vazia ou sem linhas de dados.' }],
      assets: [],
      summary: { totalRows: 0, totalAssets: 0, byCategory: {} },
    };
  }

  const header = mapHeader(ws.getRow(1));
  // Confere colunas mínimas presentes.
  const required = ['categoria', 'equipamento', 'marca'];
  const missing = required.filter((c) => header[c] === undefined);
  if (missing.length > 0) {
    return {
      valid: false,
      errors: [
        {
          row: 1,
          message: `Cabeçalho não reconhecido. Faltam colunas: ${missing.join(', ')}.`,
        },
      ],
      assets: [],
      summary: { totalRows: 0, totalAssets: 0, byCategory: {} },
    };
  }

  const assets: ParsedAsset[] = [];
  const seenIds = new Map<string, number>(); // identificador → 1ª linha vista

  // Coleta linhas cruas primeiro (pra validar duplicidade e existência).
  interface Raw {
    row: number;
    categoriaRaw: string;
    equipamento: string;
    marca: string;
    sn: string;
    modelo: string;
    quantidade: string;
    imei: string;
  }
  const raws: Raw[] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (key: string) =>
      header[key] !== undefined ? cellText(row.getCell(header[key]).value) : '';

    const categoriaRaw = get('categoria');
    const equipamento = get('equipamento');
    const marca = get('marca');
    const sn = get('sn');
    const modelo = get('modelo');
    const quantidade = get('quantidade');
    const imei = get('imei');

    // Pula linhas totalmente vazias (comuns no fim da planilha).
    if (
      !categoriaRaw && !equipamento && !marca && !sn && !modelo && !quantidade && !imei
    ) {
      continue;
    }
    raws.push({ row: r, categoriaRaw, equipamento, marca, sn, modelo, quantidade, imei });
  }

  if (raws.length === 0) {
    return {
      valid: false,
      errors: [{ row: 0, message: 'Nenhuma linha de dados encontrada.' }],
      assets: [],
      summary: { totalRows: 0, totalAssets: 0, byCategory: {} },
    };
  }

  // Coleta identificadores pra checar existência no banco de uma vez.
  const idsToCheck: string[] = [];

  for (const raw of raws) {
    const catKey = raw.categoriaRaw.toLowerCase();
    const category = CATEGORY_MAP[catKey];

    if (!category) {
      errors.push({
        row: raw.row,
        message: `Categoria "${raw.categoriaRaw}" inválida. Use: Notebook, Desktop, Celular ou Periférico.`,
      });
      continue;
    }

    if (!raw.marca) {
      errors.push({ row: raw.row, message: 'Marca é obrigatória.' });
      continue;
    }

    if (category === 'Periferico') {
      // Periférico: Equipamento + Quantidade obrigatórios; sem identificador.
      if (!raw.equipamento) {
        errors.push({ row: raw.row, message: 'Periférico exige a coluna Equipamento preenchida.' });
        continue;
      }
      const qty = Number(raw.quantidade);
      if (!Number.isInteger(qty) || qty <= 0) {
        errors.push({
          row: raw.row,
          message: `Quantidade inválida ("${raw.quantidade}"). Informe um inteiro maior que zero.`,
        });
        continue;
      }
      assets.push({
        category,
        identifier: null,
        model: `${raw.equipamento} ${raw.marca}`.trim(),
        quantity: qty,
        rowNumber: raw.row,
      });
    } else {
      // Notebook / Desktop / Celular: exigem Modelo e identificador.
      if (!raw.modelo) {
        errors.push({ row: raw.row, message: 'Modelo é obrigatório para este tipo de equipamento.' });
        continue;
      }

      // Identificador: SN (notebook/desktop) ou IMEI (celular).
      let identifier: string;
      if (category === 'Celular') {
        if (!raw.imei) {
          errors.push({
            row: raw.row,
            message: 'Celular exige IMEI (o IMEI é o identificador; apenas SN não basta).',
          });
          continue;
        }
        identifier = raw.imei;
      } else {
        if (!raw.sn) {
          errors.push({ row: raw.row, message: `${category} exige SN (número de série).` });
          continue;
        }
        identifier = raw.sn;
      }

      // Duplicidade dentro da própria planilha.
      const firstSeen = seenIds.get(identifier);
      if (firstSeen !== undefined) {
        errors.push({
          row: raw.row,
          message: `Identificador "${identifier}" repetido (já aparece na linha ${firstSeen}).`,
        });
        continue;
      }
      seenIds.set(identifier, raw.row);
      idsToCheck.push(identifier);

      assets.push({
        category,
        identifier,
        model: `${raw.marca} ${raw.modelo}`.trim(),
        quantity: 1,
        rowNumber: raw.row,
      });
    }
  }

  // Checa identificadores já existentes no Control (V2 — recusa a linha).
  if (idsToCheck.length > 0) {
    const existing = await prisma.asset.findMany({
      where: { serialNumber: { in: idsToCheck } },
      select: { serialNumber: true },
    });
    const existingSet = new Set(existing.map((e: { serialNumber: string }) => e.serialNumber));
    if (existingSet.size > 0) {
      // Remove os que já existem dos assets e registra erro.
      for (let i = assets.length - 1; i >= 0; i--) {
        const a = assets[i];
        if (a.identifier && existingSet.has(a.identifier)) {
          errors.push({
            row: a.rowNumber,
            message: `Identificador "${a.identifier}" já existe no Control. Linha recusada.`,
          });
          assets.splice(i, 1);
        }
      }
    }
  }

  const valid = errors.length === 0;

  // Resumo (só faz sentido detalhado se válido; ainda assim computamos).
  const byCategory: Record<string, number> = {};
  let totalAssets = 0;
  if (valid) {
    for (const a of assets) {
      byCategory[a.category] = (byCategory[a.category] ?? 0) + a.quantity;
      totalAssets += a.quantity;
    }
  }

  return {
    valid,
    errors: errors.sort((a, b) => a.row - b.row),
    assets: valid ? assets : [],
    summary: {
      totalRows: raws.length,
      totalAssets,
      byCategory,
    },
  };
}

// =====================================================================
// FASE 2: pedido de importação (pendente → aprovado/recusado)
// =====================================================================

function httpErr(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Cria um pedido de importação PENDENTE a partir de uma planilha já
 * validada + o link do Autentique. Revalida a planilha no servidor
 * (nunca confia numa validação que veio do cliente) antes de registrar.
 */
export async function createImportRequest(
  buffer: Buffer,
  autentiqueLink: string,
  actor: AuthUser,
) {
  // Revalida no servidor — a validação é sempre reimposta aqui.
  const result = await parseAndValidateInventory(buffer);
  if (!result.valid) {
    // Não cria pedido com planilha inválida; devolve os erros.
    throw Object.assign(
      httpErr('A planilha contém erros. Corrija e reenvie.', 422),
      { validation: result },
    );
  }

  return prisma.inventoryImport.create({
    data: {
      status: 'PENDENTE',
      autentiqueLink: autentiqueLink.trim(),
      validatedAssets: result.assets as unknown as object,
      totalAssets: result.summary.totalAssets,
      submittedByUserId: actor.id,
      submittedByName: actor.name,
      submittedByRole: actor.role,
    },
  });
}

/** Lista pedidos de importação (mais recentes primeiro). */
export async function listImportRequests(status?: string) {
  return prisma.inventoryImport.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { submittedAt: 'desc' },
  });
}

/** Detalhe de um pedido (inclui os ativos validados). */
export async function getImportRequest(id: number) {
  const imp = await prisma.inventoryImport.findUnique({ where: { id } });
  if (!imp) throw httpErr('Pedido de importação não encontrado.', 404);
  return imp;
}

/**
 * APROVA um pedido: revalida os identificadores (algum pode ter passado
 * a existir desde o envio), cria os ativos que ainda não existem, pula
 * os que colidem, e registra o resultado. Tudo numa transação.
 */
export async function approveImportRequest(id: number, actor: AuthUser) {
  const imp = await prisma.inventoryImport.findUnique({ where: { id } });
  if (!imp) throw httpErr('Pedido de importação não encontrado.', 404);
  if (imp.status !== 'PENDENTE') {
    throw httpErr('Este pedido já foi resolvido.', 409);
  }

  const assets = imp.validatedAssets as unknown as ParsedAsset[];

  // Revalidação (Q2): identificadores que passaram a existir são pulados.
  const withId = assets.filter((a) => a.identifier !== null);
  const ids = withId.map((a) => a.identifier as string);
  const existing = await prisma.asset.findMany({
    where: { serialNumber: { in: ids } },
    select: { serialNumber: true },
  });
  const existingSet = new Set(
    existing.map((e: { serialNumber: string }) => e.serialNumber),
  );

  const skipped: { identifier: string; model: string }[] = [];
  let createdCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const a of assets) {
      if (a.identifier !== null) {
        // Item com identificador (notebook/desktop/celular).
        if (existingSet.has(a.identifier)) {
          skipped.push({ identifier: a.identifier, model: a.model });
          continue;
        }
        await tx.asset.create({
          data: {
            serialNumber: a.identifier,
            model: a.model,
            category: a.category,
            status: 'Disponivel',
          },
        });
        await tx.movementLog.create({
          data: {
            assetSerialNumber: a.identifier,
            originStatus: null,
            destinationStatus: 'Disponivel',
            notes: `[INGESTÃO INVENTÁRIO] Importado do inventário #${imp.id}.`,
            actorUserId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
          },
        });
        createdCount += 1;
      } else {
        // Periférico: cria `quantity` ativos individuais (SN sintético).
        for (let i = 0; i < a.quantity; i++) {
          const sn = syntheticSerial(a.model);
          await tx.asset.create({
            data: {
              serialNumber: sn,
              model: a.model,
              category: a.category,
              status: 'Disponivel',
            },
          });
          await tx.movementLog.create({
            data: {
              assetSerialNumber: sn,
              originStatus: null,
              destinationStatus: 'Disponivel',
              notes: `[INGESTÃO INVENTÁRIO] Importado do inventário #${imp.id}.`,
              actorUserId: actor.id,
              actorName: actor.name,
              actorRole: actor.role,
            },
          });
          createdCount += 1;
        }
      }
    }

    await tx.inventoryImport.update({
      where: { id },
      data: {
        status: 'APROVADO',
        resolvedByUserId: actor.id,
        resolvedByName: actor.name,
        resolvedByRole: actor.role,
        resolvedAt: new Date(),
        createdCount,
        skippedItems: skipped.length > 0 ? (skipped as unknown as object) : undefined,
      },
    });
  });

  return { createdCount, skipped };
}

/** RECUSA um pedido, com motivo obrigatório. */
export async function rejectImportRequest(
  id: number,
  reason: string,
  actor: AuthUser,
) {
  const imp = await prisma.inventoryImport.findUnique({ where: { id } });
  if (!imp) throw httpErr('Pedido de importação não encontrado.', 404);
  if (imp.status !== 'PENDENTE') {
    throw httpErr('Este pedido já foi resolvido.', 409);
  }
  if (!reason || !reason.trim()) {
    throw httpErr('Informe o motivo da recusa.', 422);
  }

  return prisma.inventoryImport.update({
    where: { id },
    data: {
      status: 'RECUSADO',
      rejectionReason: reason.trim(),
      resolvedByUserId: actor.id,
      resolvedByName: actor.name,
      resolvedByRole: actor.role,
      resolvedAt: new Date(),
    },
  });
}

// Gera um SN sintético pra periféricos (sem série real), no mesmo espírito
// do cadastro em massa. Prefixo do modelo + aleatório.
function syntheticSerial(model: string): string {
  const prefix = model
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'PERIF';
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `INV-${prefix}-${rand}`;
}
