// =====================================================================
// Transformação do export do Uniit (KACE) → registros de ativo da Control
// =====================================================================
// O Uniit exporta um inventário de máquinas configuradas pela TI com o
// cabeçalho:
//
//   Hostname; Status; Sistema Operacional; Responsável; Último Logon;
//   Alterado em; Serial Number; SO KACE; Versão SO; Processador
//
// Esse formato NÃO casa com o importador de Inventário (que é orientado a
// categoria + assinatura Autentique). Aqui fazemos um mapeamento próprio,
// idempotente, pensado pra carga em massa (~3 mil hosts):
//
//   • Escopo   : só linhas COM Serial Number.
//   • Chave    : Serial Number; se o serial repetir, cai pro Hostname
//                (que é único no arquivo).
//   • Categoria: Desktop (o export não distingue notebook/desktop).
//   • Modelo   : "Desconhecido" + o processador quando presente
//                (o arquivo não traz marca/modelo real).
//   • Status   : Disponível, isArchived=false — "Desativado" no Uniit NÃO
//                arquiva (às vezes marca inativo erroneamente).
//   • Observação: linha de contexto com host, responsável, SO e último
//                logon (o "Responsável" fica aqui, não vira atribuição).
//
// Este módulo é PURO (sem Prisma, sem I/O de rede): recebe o buffer do CSV
// e devolve os registros prontos + estatísticas. Isso o torna testável de
// forma isolada. A persistência (upsert) fica no script importUniit.ts.

/** Categoria fixa: o export do Uniit é de estações de trabalho. */
export type UniitCategory = 'Desktop';

export interface UniitAssetRecord {
  /** Chave única do ativo na Control (serialNumber @id). */
  key: string;
  /** De onde veio a chave — só pra diagnóstico/relatório. */
  keySource: 'serial' | 'hostname';
  category: UniitCategory;
  model: string;
  observacao: string;
  /** Campos crus preservados (úteis pra relatório/depuração). */
  hostname: string;
  serial: string;
  responsavel: string;
  statusUniit: string;
}

export interface SkippedRow {
  row: number;
  hostname: string;
  reason: string;
}

export interface UniitParseResult {
  records: UniitAssetRecord[];
  skipped: SkippedRow[];
  stats: {
    totalRows: number;
    withSerial: number;
    withoutSerial: number;
    keyedByHostname: number;
    duplicateHostnameSkipped: number;
  };
}

// --- Codificação: reaproveita a mesma lógica do importador de inventário
//     (Excel pt-BR salva CSV em Windows-1252, não UTF-8). ---
export function decodeCsv(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer);
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function detectDelimiter(firstLine: string): string {
  const counts: Record<string, number> = {
    ';': (firstLine.match(/;/g) ?? []).length,
    ',': (firstLine.match(/,/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Parser CSV mínimo com suporte a aspas (campos com o delimitador dentro
 * de "..."). Suficiente pro export do Uniit; não depende do ExcelJS.
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Remove acentos e sobe pra maiúsculas (comparação de cabeçalho). */
function normHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

// Aliases de cabeçalho → chave lógica. Tolerante a variações do Uniit.
const HEADER_ALIASES: Record<string, string[]> = {
  hostname: ['HOSTNAME'],
  status: ['STATUS'],
  so: ['SISTEMA OPERACIONAL'],
  responsavel: ['RESPONSAVEL'],
  ultimoLogon: ['ULTIMO LOGON'],
  alteradoEm: ['ALTERADO EM'],
  serial: ['SERIAL NUMBER', 'SERIAL', 'SN'],
  soKace: ['SO KACE'],
  versaoSo: ['VERSAO SO'],
  processador: ['PROCESSADOR'],
};

// Seriais-placeholder de BIOS: valores genéricos que a fábrica/OEM deixa
// e que NÃO identificam a máquina. Tratados como "sem serial usável" — a
// chave cai pro hostname (que é único). Comparação sem acento/caixa.
const PLACEHOLDER_SERIALS = new Set([
  'DEFAULT STRING',
  'SYSTEM SERIAL NUMBER',
  'TO BE FILLED BY O.E.M.',
  'TO BE FILLED BY OEM',
  'NONE',
  'N/A',
  'NA',
  'INVALID',
  'O.E.M.',
  'OEM',
  '0',
  '00000000',
  '123456789',
]);

function isPlaceholderSerial(serial: string): boolean {
  return PLACEHOLDER_SERIALS.has(normHeader(serial));
}

function mapHeader(cells: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  cells.forEach((raw, idx) => {
    const n = normHeader(raw);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(n)) map[key] = idx;
    }
  });
  return map;
}

/**
 * Limpa o texto do processador: remove "(R)", "(TM)" e o sufixo
 * "(N cores, M logical processors)". Mantém o núcleo legível.
 * Ex.: "13th Gen Intel(R) Core(TM) i5-1335U (10 cores, 12 logical
 * processors)" → "13th Gen Intel Core i5-1335U".
 */
export function cleanProcessor(raw: string): string {
  return raw
    .replace(/\((?:R|TM|C)\)/gi, '')
    .replace(/\s*\(\s*\d+\s*cores?.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Monta o campo "model": "Desconhecido" + processador quando houver. */
export function buildModel(processador: string): string {
  const proc = cleanProcessor(processador);
  return proc ? `Desconhecido — ${proc}` : 'Desconhecido';
}

/** Monta a observação de contexto (o "Responsável" vive aqui). */
export function buildObservacao(f: {
  hostname: string;
  responsavel: string;
  so: string;
  ultimoLogon: string;
}): string {
  const partes: string[] = ['Importado do Uniit'];
  if (f.hostname) partes.push(`Host: ${f.hostname}`);
  if (f.responsavel) partes.push(`Responsável: ${f.responsavel}`);
  if (f.so) partes.push(`SO: ${f.so}`);
  if (f.ultimoLogon) partes.push(`Último logon: ${f.ultimoLogon}`);
  return partes.join(' · ');
}

/**
 * Parseia e transforma o buffer do CSV do Uniit em registros de ativo.
 * Não persiste nada.
 */
export function parseUniitCsv(buffer: Buffer): UniitParseResult {
  const text = decodeCsv(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) {
    return {
      records: [],
      skipped: [],
      stats: {
        totalRows: 0,
        withSerial: 0,
        withoutSerial: 0,
        keyedByHostname: 0,
        duplicateHostnameSkipped: 0,
      },
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const header = mapHeader(parseCsvLine(lines[0], delimiter));

  const get = (cells: string[], key: string): string =>
    header[key] !== undefined ? (cells[header[key]] ?? '').trim() : '';

  const records: UniitAssetRecord[] = [];
  const skipped: SkippedRow[] = [];
  const usedKeys = new Set<string>();

  let withSerial = 0;
  let withoutSerial = 0;
  let keyedByHostname = 0;
  let duplicateHostnameSkipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter);
    const hostname = get(cells, 'hostname');
    const serial = get(cells, 'serial');
    const responsavel = get(cells, 'responsavel');
    const so = get(cells, 'so') || get(cells, 'soKace');
    const ultimoLogon = get(cells, 'ultimoLogon');
    const processador = get(cells, 'processador');
    const statusUniit = get(cells, 'status');

    // Escopo: só linhas com Serial Number.
    if (!serial) {
      withoutSerial++;
      skipped.push({
        row: i + 1,
        hostname,
        reason: 'Sem Serial Number (fora do escopo escolhido).',
      });
      continue;
    }
    withSerial++;

    // Chave: serial usável e ainda não visto; senão cai pro hostname
    // (serial duplicado OU serial-placeholder de BIOS). Hostname é único.
    const serialUsable = !isPlaceholderSerial(serial);
    let key: string;
    let keySource: 'serial' | 'hostname';
    if (serialUsable && !usedKeys.has(serial)) {
      key = serial;
      keySource = 'serial';
    } else if (hostname && !usedKeys.has(hostname)) {
      key = hostname;
      keySource = 'hostname';
      keyedByHostname++;
    } else {
      duplicateHostnameSkipped++;
      skipped.push({
        row: i + 1,
        hostname,
        reason: `Serial "${serial}" não utilizável (duplicado/placeholder) e hostname indisponível/repetido — linha ignorada.`,
      });
      continue;
    }
    usedKeys.add(key);

    records.push({
      key,
      keySource,
      category: 'Desktop',
      model: buildModel(processador),
      observacao: buildObservacao({ hostname, responsavel, so, ultimoLogon }),
      hostname,
      serial,
      responsavel,
      statusUniit,
    });
  }

  return {
    records,
    skipped,
    stats: {
      totalRows: lines.length - 1,
      withSerial,
      withoutSerial,
      keyedByHostname,
      duplicateHostnameSkipped,
    },
  };
}
