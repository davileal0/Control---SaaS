// =====================================================================
// Parser de SNs colados da planilha do almoxarifado
// =====================================================================
// O almoxarifado bipa as SNs e manda uma planilha (Excel/CSV). O
// operador copia e cola o conteúdo. Este módulo transforma esse texto
// bruto numa lista limpa de SNs, tolerando:
//   - cabeçalho (linha "SN" / "Serial" / "Número de série")
//   - separador tab (Excel cola com tab) ou outras colunas
//   - espaços, linhas vazias
//   - SNs duplicadas dentro do próprio paste (dedup interno)
//
// NÃO valida contra o banco — isso é feito no service (que sabe quais
// SNs já existem). Aqui é só limpeza + estrutura.

export type ParsedSerials = {
  /** SNs únicas e limpas, na ordem de aparição */
  serials: string[];
  /** Quantas linhas foram ignoradas (vazias/cabeçalho) */
  skippedLines: number;
  /** SNs que apareceram repetidas DENTRO do paste (já removidas de serials) */
  duplicatesInPaste: string[];
};

// Palavras que, sozinhas na primeira coluna da primeira linha, indicam
// cabeçalho (e não uma SN real). Comparação case-insensitive.
const HEADER_HINTS = [
  'sn',
  'serial',
  'serialnumber',
  'serial number',
  'numerodeserie',
  'numero de serie',
  'número de série',
  'n/s',
  'ns',
];

/**
 * Pega a primeira coluna de uma linha tab/`;`/`,`-separada.
 * O almoxarifado pode colar "SN<tab>modelo<tab>..." — só a SN importa
 * (o modelo vem da S.C.). Se não houver separador, a linha inteira é a SN.
 */
function firstColumn(line: string): string {
  // Tenta tab primeiro (Excel), depois ; e , como fallback
  for (const sep of ['\t', ';', ',']) {
    if (line.includes(sep)) {
      return line.split(sep)[0]!.trim();
    }
  }
  return line.trim();
}

function looksLikeHeader(value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return HEADER_HINTS.includes(normalized);
}

export function parseSerials(raw: string): ParsedSerials {
  const lines = raw.split(/\r?\n/);
  const seen = new Set<string>();
  const serials: string[] = [];
  const duplicatesInPaste: string[] = [];
  let skippedLines = 0;

  lines.forEach((line, index) => {
    const sn = firstColumn(line);

    // Linha vazia → ignora
    if (sn.length === 0) {
      skippedLines += 1;
      return;
    }

    // Primeira linha que parece cabeçalho → ignora
    if (index === 0 && looksLikeHeader(sn)) {
      skippedLines += 1;
      return;
    }

    // Dedup interno (case-sensitive: SNs são identificadores exatos)
    if (seen.has(sn)) {
      duplicatesInPaste.push(sn);
      return;
    }

    seen.add(sn);
    serials.push(sn);
  });

  return { serials, skippedLines, duplicatesInPaste };
}
