import PDFDocument from 'pdfkit';
import {
  PurchaseJustificationReport,
  categoryLabel,
} from './purchaseJustificationService';

// =====================================================================
// PDF do Relatório de Justificativa de Compra
// =====================================================================
// Estética sóbria, corporativa. Cores neutras com acentos discretos
// pra status. Gráficos desenhados como vetor puro (pdfkit) — sem
// dependências de canvas ou Chromium.
//
// Layout: cabeçalho com identificação → recomendação em destaque →
// seções de dados (saldo, movimentações, descartes, quebras, setores)
// → fundamentação narrativa.
// =====================================================================

const COLORS = {
  text: '#1A1A1A',
  textMuted: '#666666',
  border: '#D0D0D0',
  borderSoft: '#E8E8E8',
  bgSubtle: '#F8F8F8',
  accent: '#B5302F',         // vermelho de marca
  accentSoft: '#B5302F15',
  available: '#6E8E60',      // verde acinzentado
  inUse: '#B5302F',
  damaged: '#C99732',        // amarelo dourado
  warn: '#C99732',
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR');
}
function fmtDateTime(d: Date): string {
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function fmtMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}
function categoryDisplay(c: PurchaseJustificationReport['meta']['category']): string {
  return { Notebook: 'Notebooks', Desktop: 'Desktops', Celular: 'Celulares', AllInOne: 'All-in-Ones', Periferico: 'Periféricos' }[c];
}
function roleDisplay(r: string): string {
  return { OPERADOR_N1: 'Operador N1', LIDER_N1: 'Líder N1', DIRETOR_TI: 'Diretor de TI' }[r as keyof Record<string, string>] ?? r;
}

export async function buildPurchaseJustificationPdf(
  report: PurchaseJustificationReport,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `Justificativa de Compra — ${categoryDisplay(report.meta.category)}`,
          Author: 'Control · Gestão de Ativos',
          Subject: 'Relatório de Justificativa de Compra',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ============== CABEÇALHO ==============
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(COLORS.textMuted)
        .text('CONTROL · CONTROLE DE ATIVOS DE TI', { characterSpacing: 1.5 });

      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.text);
      doc.text('Relatório de Justificativa de Compra');

      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).fillColor(COLORS.textMuted);
      doc.text(
        `Categoria: ${categoryDisplay(report.meta.category)}  ·  ` +
          `Período: ${fmtDate(report.meta.periodStart)} a ${fmtDate(report.meta.periodEnd)}`,
      );
      doc.text(
        `Gerado por ${report.meta.generatedByName} (${roleDisplay(report.meta.generatedByRole)}) ` +
          `em ${fmtDateTime(report.meta.generatedAt)}`,
      );

      sectionDivider(doc);

      // ============== SOLICITAÇÃO (DESTAQUE) ==============
      const boxTop = doc.y;
      const boxHeight = 70;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc
        .rect(doc.page.margins.left, boxTop, pageWidth, boxHeight)
        .fillAndStroke(COLORS.accentSoft, COLORS.accent);

      doc.fillColor(COLORS.textMuted).font('Helvetica-Bold').fontSize(9);
      doc.text('SOLICITAÇÃO', doc.page.margins.left + 18, boxTop + 12, {
        characterSpacing: 1.5,
      });

      doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(22);
      doc.text(
        `Solicitação de aquisição de ${report.recommendation.quantity} ${categoryDisplay(report.meta.category).toUpperCase()}`,
        doc.page.margins.left + 18,
        boxTop + 28,
      );

      doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(10);
      doc.text(
        'para reposição do estoque atual.',
        doc.page.margins.left + 18,
        boxTop + 53,
      );

      doc.y = boxTop + boxHeight + 16;

      // ============== SALDO ATUAL DO ESTOQUE ==============
      sectionTitle(doc, 'Saldo atual do estoque');

      const stockY = doc.y + 4;
      drawStockBar(
        doc,
        stockY,
        report.currentStock.available,
        report.currentStock.inUse,
        report.currentStock.damaged,
      );
      doc.y = stockY + 32;

      doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
      const stockTable = [
        ['Disponível', report.currentStock.available],
        ['Em Uso', report.currentStock.inUse],
        ['Danificado', report.currentStock.damaged],
        ['Total ativo', report.currentStock.totalActive],
      ] as const;
      drawSimpleKeyValue(doc, stockTable);

      if (report.currentStock.isCritical) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Oblique').fontSize(10).fillColor(COLORS.warn);
        doc.text(
          '⚠  Saldo disponível insuficiente para cobrir descartes recentes + máquinas em assistência.',
        );
        doc.fillColor(COLORS.text).font('Helvetica');
      }

      // ============== MOVIMENTAÇÕES NO PERÍODO ==============
      sectionTitle(doc, 'Movimentações no período');

      const movs = [
        ['Atribuições a colaboradores', report.movements.assignments],
        ['Devoluções recebidas', report.movements.returns],
        ['Reaproveitamentos', report.movements.reassignments],
      ] as const;
      drawSimpleKeyValue(doc, movs);

      if (report.movements.reassignments > 0) {
        doc.moveDown(0.3);
        doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(COLORS.available);
        doc.text(
          `→ Os ${report.movements.reassignments} reaproveitamentos representam ${report.movements.reassignments} ${categoryLabel(report.meta.category)} que NÃO precisaram ser comprados.`,
        );
        doc.fillColor(COLORS.text).font('Helvetica');
      }

      // Gráfico de barras por mês
      if (report.movements.byMonth.length > 0) {
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.textMuted);
        doc.text('DISTRIBUIÇÃO POR MÊS', { characterSpacing: 1 });
        doc.moveDown(0.4);
        drawMonthlyBars(doc, report.movements.byMonth);
      }

      // ============== DESCARTES NO PERÍODO ==============
      ensureSpace(doc, 160);
      sectionTitle(doc, `Descartes no período (${report.discards.total})`);

      if (report.discards.items.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor(COLORS.textMuted);
        doc.text('Nenhum descarte registrado nesta categoria no período.');
        doc.fillColor(COLORS.text).font('Helvetica');
      } else {
        drawDiscardsTable(doc, report.discards.items);
      }

      // ============== QUEBRAS E REPAROS ==============
      ensureSpace(doc, 140);
      sectionTitle(doc, 'Quebras e reparos');

      const breaks = [
        ['Enviados à assistência (Spectra)', report.breakdownsAndRepairs.sentToRepair],
        ['Voltaram reparados', report.breakdownsAndRepairs.returnedRepaired],
        ['Condenados / descartados após reparo', report.breakdownsAndRepairs.condemnedAfterRepair],
      ] as const;
      drawSimpleKeyValue(doc, breaks);

      // Análise qualitativa de quebras
      if (
        report.breakdownsAndRepairs.frequentDefects.length > 0 ||
        report.breakdownsAndRepairs.topDamageSectors.length > 0
      ) {
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.textMuted);
        doc.text('ANÁLISE QUALITATIVA DE QUEBRAS', { characterSpacing: 1 });
        doc.moveDown(0.3);

        const defectsLine = report.breakdownsAndRepairs.frequentDefects
          .map((d) => `${d.label} (${d.count})`)
          .join(', ');
        const sectorsLine = report.breakdownsAndRepairs.topDamageSectors
          .map((s) => `${s.department} (${s.count})`)
          .join(' e ');

        doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
        if (defectsLine) {
          doc.text(`Defeitos mais frequentes: ${defectsLine}.`);
        }
        if (sectorsLine) {
          doc.moveDown(0.2);
          doc.text(`Setores com maior incidência de danos: ${sectorsLine}.`);
        }
      }

      // ============== DISTRIBUIÇÃO POR SETOR ==============
      if (report.distributionBySector.length > 0) {
        ensureSpace(doc, 100);
        sectionTitle(doc, 'Distribuição por setor (em uso atualmente)');
        drawSimpleKeyValue(
          doc,
          report.distributionBySector.map((s) => [s.department, s.count]),
        );
      }

      // ============== BY MODEL (só Periféricos) ==============
      if (report.byModel && report.byModel.length > 0) {
        ensureSpace(doc, 100);
        sectionTitle(doc, 'Detalhamento por modelo');
        drawSimpleKeyValue(
          doc,
          report.byModel.map((m) => [m.model, m.count]),
        );
      }

      // ============== FUNDAMENTAÇÃO DA SOLICITAÇÃO ==============
      ensureSpace(doc, 100);
      sectionTitle(doc, 'Fundamentação da solicitação');
      doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.text);
      doc.text(report.recommendation.summary, { align: 'justify', lineGap: 2 });

      // ============== RODAPÉ ==============
      const footerY = doc.page.height - 35;
      doc
        .fontSize(8)
        .fillColor(COLORS.textMuted)
        .text(
          `Control · Documento gerado automaticamente · ${fmtDateTime(report.meta.generatedAt)}`,
          doc.page.margins.left,
          footerY,
          { align: 'center', width: pageWidth },
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------
// Funções auxiliares de desenho (pdfkit vetor puro)
// ---------------------------------------------------------------------

function sectionDivider(doc: PDFKit.PDFDocument) {
  doc.moveDown(0.6);
  const y = doc.y;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.6);
}

function sectionTitle(doc: PDFKit.PDFDocument, label: string) {
  doc.moveDown(0.8);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(COLORS.text)
    .text(label.toUpperCase(), { characterSpacing: 1 });
  const y = doc.y + 2;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .strokeColor(COLORS.borderSoft)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.6);
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
}

function drawSimpleKeyValue(doc: PDFKit.PDFDocument, rows: ReadonlyArray<readonly [string, number | string]>) {
  doc.font('Helvetica').fontSize(10);
  const leftX = doc.page.margins.left;
  const rightX = doc.page.width - doc.page.margins.right;
  for (const [label, value] of rows) {
    const y = doc.y;
    doc.fillColor(COLORS.textMuted).text(label, leftX, y, { continued: false });
    doc.fillColor(COLORS.text).font('Helvetica-Bold').text(String(value), leftX, y, {
      width: rightX - leftX,
      align: 'right',
    });
    doc.font('Helvetica');
  }
}

function drawStockBar(
  doc: PDFKit.PDFDocument,
  y: number,
  available: number,
  inUse: number,
  damaged: number,
) {
  const total = available + inUse + damaged;
  if (total === 0) return;

  const leftX = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const barHeight = 14;

  const wAvail = (available / total) * width;
  const wUse = (inUse / total) * width;
  const wDmg = (damaged / total) * width;

  let cursor = leftX;
  doc.rect(cursor, y, wAvail, barHeight).fill(COLORS.available);
  cursor += wAvail;
  doc.rect(cursor, y, wUse, barHeight).fill(COLORS.inUse);
  cursor += wUse;
  doc.rect(cursor, y, wDmg, barHeight).fill(COLORS.damaged);

  // Legenda
  const lY = y + barHeight + 5;
  drawLegendDot(doc, leftX, lY, COLORS.available, `Disponível ${available}`);
  drawLegendDot(doc, leftX + 100, lY, COLORS.inUse, `Em Uso ${inUse}`);
  drawLegendDot(doc, leftX + 180, lY, COLORS.damaged, `Danificado ${damaged}`);
}

function drawLegendDot(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  color: string,
  label: string,
) {
  doc.circle(x + 4, y + 4, 3).fill(color);
  doc
    .fillColor(COLORS.textMuted)
    .font('Helvetica')
    .fontSize(9)
    .text(label, x + 12, y, { lineBreak: false });
}

function drawMonthlyBars(
  doc: PDFKit.PDFDocument,
  data: { month: string; assignments: number; returns: number; reassignments: number }[],
) {
  const leftX = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startY = doc.y;
  const chartHeight = 90;

  // Determina a escala (valor máximo entre todas as séries)
  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => [d.assignments, d.returns, d.reassignments]),
  );

  const groupWidth = width / data.length;
  const barWidth = Math.min(10, (groupWidth - 8) / 3);
  const barGap = 2;

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const groupX = leftX + i * groupWidth + (groupWidth - (barWidth * 3 + barGap * 2)) / 2;

    const series = [
      { val: d.assignments, color: COLORS.inUse },
      { val: d.returns, color: COLORS.available },
      { val: d.reassignments, color: COLORS.warn },
    ];

    series.forEach((s, idx) => {
      const h = (s.val / maxVal) * chartHeight;
      const x = groupX + idx * (barWidth + barGap);
      const y = startY + chartHeight - h;
      if (s.val > 0) {
        doc.rect(x, y, barWidth, h).fill(s.color);
      }
    });

    // Rótulo do mês
    doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(8);
    doc.text(fmtMonth(d.month), groupX - 4, startY + chartHeight + 3, {
      width: barWidth * 3 + barGap * 2 + 8,
      align: 'center',
      lineBreak: false,
    });
  }

  doc.y = startY + chartHeight + 18;

  // Legenda do gráfico de barras
  const lY = doc.y;
  drawLegendDot(doc, leftX, lY, COLORS.inUse, 'Atribuições');
  drawLegendDot(doc, leftX + 100, lY, COLORS.available, 'Devoluções');
  drawLegendDot(doc, leftX + 200, lY, COLORS.warn, 'Reaproveitamentos');
  doc.y = lY + 14;
}

function drawDiscardsTable(
  doc: PDFKit.PDFDocument,
  items: { serialNumber: string; model: string; reason: string; discardedAt: Date }[],
) {
  const leftX = doc.page.margins.left;
  const rightX = doc.page.width - doc.page.margins.right;
  const width = rightX - leftX;

  // Cabeçalho da tabela
  const cols = [
    { label: 'SN', x: leftX, w: width * 0.16 },
    { label: 'Modelo', x: leftX + width * 0.16, w: width * 0.26 },
    { label: 'Data', x: leftX + width * 0.42, w: width * 0.12 },
    { label: 'Motivo', x: leftX + width * 0.54, w: width * 0.46 },
  ];

  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.textMuted);
  // Captura o Y UMA vez: cada doc.text() avança doc.y, então usar
  // doc.y dentro do loop faria cada coluna descer um degrau (cabeçalho
  // escalonado na diagonal). Todas as colunas do cabeçalho compartilham
  // a mesma linha de base — igual às linhas de dados (rowY) abaixo.
  const headY = doc.y;
  for (const col of cols) {
    doc.text(col.label.toUpperCase(), col.x, headY, {
      width: col.w - 6,
      lineBreak: false,
      characterSpacing: 1,
    });
  }
  // Posiciona o cursor logo abaixo do cabeçalho usando a altura REAL do
  // texto (não moveDown, que depende de lineHeight e pode ficar curto).
  const headTextHeight = doc.heightOfString('SN', { lineBreak: false });
  const headEnd = headY + headTextHeight + 5;
  doc
    .moveTo(leftX, headEnd)
    .lineTo(rightX, headEnd)
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .stroke();
  doc.y = headEnd;
  doc.moveDown(0.3);

  // Linhas
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.text);
  for (const item of items) {
    ensureSpace(doc, 20);
    const rowY = doc.y;
    doc.text(item.serialNumber, cols[0].x, rowY, { width: cols[0].w - 6, lineBreak: false, ellipsis: true });
    doc.text(item.model, cols[1].x, rowY, { width: cols[1].w - 6, lineBreak: false, ellipsis: true });
    doc.text(fmtDate(item.discardedAt), cols[2].x, rowY, { width: cols[2].w - 6, lineBreak: false });
    doc.text(item.reason, cols[3].x, rowY, { width: cols[3].w - 6, height: 24, ellipsis: true });
    doc.moveDown(0.5);
  }
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 30) {
    doc.addPage();
  }
}
