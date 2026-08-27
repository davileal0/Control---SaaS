import PDFDocument from 'pdfkit';
import {
  PurchaseDefenseReport,
  DefenseCategorySection,
} from './purchaseDefenseService';

// =====================================================================
// PDF do Relatório de Defesa de Compra (multi-categoria)
// =====================================================================
// Imita o visual do template corporativo Unifique: capa azul cheia,
// headers de seção numerados, faixa de 4 KPIs com top-border colorida,
// tabelas com header ciano + linha de total azul, caixas de observação.
//
// Cores extraídas do template de referência (amostragem de pixel).
// =====================================================================

const C = {
  // Azul Unifique profundo — headers de seção, totais, números KPI
  deepBlue: '#212492',
  // Ciano — headers de tabela
  cyan: '#00A2FF',
  // Teal — 3ª top-border de KPI
  teal: '#3FCFD5',
  // Amarelo — 4ª top-border de KPI, caixa de alerta
  yellow: '#F5EC5A',
  // Fundo do bloco de KPIs
  kpiBg: '#F0F4FB',
  // Caixa de observação (info)
  infoBg: '#EDF0FB',
  infoBar: '#212492',
  // Caixa de atenção (alerta)
  warnBg: '#FFFBE8',
  warnBar: '#E9B800',
  // Texto
  text: '#1A1A2E',
  textMuted: '#6B7280',
  white: '#FFFFFF',
  // Zebra de tabela
  zebra: '#F5F7FA',
  border: '#D8DEE9',
  // Verde — 1ª top-border de KPI
  green: '#37B24D',
};

// As 4 cores que ciclam nas top-borders dos KPIs (ordem do template)
const KPI_BORDER_COLORS = [C.green, C.cyan, C.teal, C.yellow];

const PAGE = {
  margin: 50,
  width: 595.32, // A4
  height: 841.92,
};
const CONTENT_W = PAGE.width - PAGE.margin * 2;

function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}
function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
function roleDisplay(r: string): string {
  return (
    { OPERADOR_N1: 'Operador N1', LIDER_N1: 'Líder N1', DIRETOR_TI: 'Coordenador de TI' }[
      r as 'OPERADOR_N1' | 'LIDER_N1' | 'DIRETOR_TI'
    ] ?? r
  );
}

type Doc = PDFKit.PDFDocument;

// ---------------------------------------------------------------------
// Helpers visuais (imitam o template)
// ---------------------------------------------------------------------

/** Garante espaço vertical; se faltar, nova página. Retorna o Y atual. */
function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > PAGE.height - PAGE.margin - 30) {
    doc.addPage();
  }
}

/** Header de seção: faixa azul com número grande colorido + título + sub. */
function sectionHeader(
  doc: Doc,
  num: number,
  title: string,
  subtitle: string,
): void {
  ensureSpace(doc, 90);
  const x = PAGE.margin;
  const y = doc.y;
  const h = 54;

  // Faixa azul
  doc.save();
  doc.roundedRect(x, y, CONTENT_W, h, 4).fill(C.deepBlue);

  // Número grande (ciano)
  doc
    .fillColor(C.cyan)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(String(num), x + 16, y + 13, { lineBreak: false });

  // Título (branco, bold)
  doc
    .fillColor(C.white)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(title, x + 42, y + 12, { lineBreak: false, width: CONTENT_W - 60 });

  // Subtítulo (branco translúcido)
  doc
    .fillColor('#C8CEEA')
    .font('Helvetica')
    .fontSize(9)
    .text(subtitle, x + 42, y + 32, { lineBreak: false, width: CONTENT_W - 60 });

  doc.restore();
  doc.y = y + h + 16;
  doc.x = PAGE.margin;
}

/** Faixa de KPIs: até 4 cartões com top-border colorida, número grande,
 *  label e descrição. Fundo cinza-azulado. */
function kpiStrip(
  doc: Doc,
  kpis: { value: string; label: string; desc: string }[],
): void {
  if (kpis.length === 0) return;
  ensureSpace(doc, 110);
  const x = PAGE.margin;
  const y = doc.y;
  const h = 94;
  const n = Math.min(kpis.length, 4);
  const gap = 10;
  const cardW = (CONTENT_W - gap * (n - 1)) / n;

  doc.save();
  // Fundo geral
  doc.rect(x, y, CONTENT_W, h).fill(C.kpiBg);

  kpis.slice(0, 4).forEach((kpi, i) => {
    const cx = x + i * (cardW + gap);
    // Top-border colorida (cicla as 4 cores)
    doc.rect(cx, y, cardW, 3).fill(KPI_BORDER_COLORS[i % 4]);
    // Número grande
    doc
      .fillColor(C.deepBlue)
      .font('Helvetica-Bold')
      .fontSize(22)
      .text(kpi.value, cx + 12, y + 12, { lineBreak: false, width: cardW - 16 });
    // Label (pode ter até 2 linhas) — posição fixa, com altura reservada
    doc
      .fillColor(C.text)
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(kpi.label.toUpperCase(), cx + 12, y + 42, {
        width: cardW - 18,
        height: 20,
        lineGap: 1,
        characterSpacing: 0.2,
        ellipsis: true,
      });
    // Descrição — começa abaixo da área do label (y+62, não colide)
    doc
      .fillColor(C.textMuted)
      .font('Helvetica')
      .fontSize(7)
      .text(kpi.desc, cx + 12, y + 64, {
        width: cardW - 16,
        height: 26,
        lineGap: 0.5,
        ellipsis: true,
      });
  });

  doc.restore();
  doc.y = y + h + 14;
  doc.x = PAGE.margin;
}

/** Título menor de subseção (azul, sublinhado fino). */
function subTitle(doc: Doc, text: string): void {
  ensureSpace(doc, 30);
  const y = doc.y;
  doc
    .fillColor(C.deepBlue)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(text, PAGE.margin, y, { lineBreak: false });
  // Usa a altura real do texto pra posicionar a linha (não doc.y, que
  // já avançou e causaria sobreposição/fantasma).
  const textH = doc.heightOfString(text, { lineBreak: false });
  const ly = y + textH + 3;
  doc
    .moveTo(PAGE.margin, ly)
    .lineTo(PAGE.width - PAGE.margin, ly)
    .lineWidth(0.5)
    .strokeColor(C.border)
    .stroke();
  doc.y = ly + 8;
  doc.x = PAGE.margin;
}

/** Parágrafo de corpo, com suporte a fontSize. */
function paragraph(doc: Doc, text: string): void {
  ensureSpace(doc, 40);
  doc
    .fillColor(C.text)
    .font('Helvetica')
    .fontSize(10)
    .text(text, PAGE.margin, doc.y, {
      width: CONTENT_W,
      align: 'left',
      lineGap: 2,
    });
  doc.moveDown(0.6);
  doc.x = PAGE.margin;
}

/** Caixa de observação (info=azul) ou atenção (warn=amarelo). */
function calloutBox(
  doc: Doc,
  label: string,
  text: string,
  kind: 'info' | 'warn',
): void {
  const bg = kind === 'info' ? C.infoBg : C.warnBg;
  const bar = kind === 'info' ? C.infoBar : C.warnBar;
  const x = PAGE.margin;

  // Mede a altura do texto pra dimensionar a caixa
  doc.font('Helvetica').fontSize(9);
  const fullText = `${label}  ${text}`;
  const textH = doc.heightOfString(fullText, { width: CONTENT_W - 28 });
  const boxH = textH + 16;
  ensureSpace(doc, boxH + 10);
  const y = doc.y;

  doc.save();
  doc.rect(x, y, CONTENT_W, boxH).fill(bg);
  doc.rect(x, y, 3, boxH).fill(bar); // barra lateral
  // Label em bold + texto
  doc.fillColor(C.deepBlue).font('Helvetica-Bold').fontSize(9);
  doc.text(label, x + 12, y + 8, { continued: true });
  doc.fillColor(C.text).font('Helvetica').fontSize(9);
  doc.text(`  ${text}`, { width: CONTENT_W - 28 });
  doc.restore();

  doc.y = y + boxH + 12;
  doc.x = PAGE.margin;
}

/** Tabela estilizada: header ciano, linhas zebradas, linha de total
 *  azul opcional. cols define largura proporcional e alinhamento. */
function styledTable(
  doc: Doc,
  cols: { label: string; key: string; w: number; align?: 'left' | 'center' | 'right' }[],
  rows: Record<string, string>[],
  totalRow?: Record<string, string>,
): void {
  const x = PAGE.margin;
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  // Normaliza larguras pra somar CONTENT_W
  const scale = CONTENT_W / totalW;
  const colX: number[] = [];
  let acc = x;
  for (const c of cols) {
    colX.push(acc);
    acc += c.w * scale;
  }

  const rowH = 24;
  const headH = 24;

  function drawCell(
    text: string,
    cx: number,
    cy: number,
    w: number,
    align: 'left' | 'center' | 'right',
    h: number,
  ) {
    const padX = 8;
    // height = altura de 1 linha força o ellipsis a truncar em vez de
    // quebrar pra segunda linha (que vazaria pra fora da célula).
    doc.text(text, cx + padX, cy + (h - 9) / 2 - 1, {
      width: w - padX * 2,
      align,
      lineBreak: false,
      height: 11,
      ellipsis: true,
    });
  }

  // Header
  ensureSpace(doc, headH + rowH * 2);
  let y = doc.y;
  doc.save();
  doc.rect(x, y, CONTENT_W, headH).fill(C.cyan);
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9);
  cols.forEach((c, i) => {
    drawCell(c.label.toUpperCase(), colX[i], y, c.w * scale, c.align ?? 'left', headH);
  });
  doc.restore();
  y += headH;

  // Linhas (zebra)
  doc.font('Helvetica').fontSize(9);
  rows.forEach((row, idx) => {
    if (y + rowH > PAGE.height - PAGE.margin - 30) {
      doc.addPage();
      y = doc.y;
    }
    if (idx % 2 === 1) {
      doc.save();
      doc.rect(x, y, CONTENT_W, rowH).fill(C.zebra);
      doc.restore();
    }
    doc.fillColor(C.text);
    cols.forEach((c, i) => {
      drawCell(row[c.key] ?? '', colX[i], y, c.w * scale, c.align ?? 'left', rowH);
    });
    // Linha divisória fina
    doc
      .moveTo(x, y + rowH)
      .lineTo(x + CONTENT_W, y + rowH)
      .lineWidth(0.3)
      .strokeColor(C.border)
      .stroke();
    y += rowH;
  });

  // Linha de total (azul)
  if (totalRow) {
    if (y + rowH > PAGE.height - PAGE.margin - 30) {
      doc.addPage();
      y = doc.y;
    }
    doc.save();
    doc.rect(x, y, CONTENT_W, rowH).fill(C.deepBlue);
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9);
    cols.forEach((c, i) => {
      drawCell(totalRow[c.key] ?? '', colX[i], y, c.w * scale, c.align ?? 'left', rowH);
    });
    doc.restore();
    y += rowH;
  }

  doc.y = y + 8;
  doc.x = PAGE.margin;
}

export {
  C,
  PAGE,
  CONTENT_W,
  fmtDate,
  fmtBRL,
  roleDisplay,
  ensureSpace,
  sectionHeader,
  kpiStrip,
  subTitle,
  paragraph,
  calloutBox,
  styledTable,
};
export type { Doc };
