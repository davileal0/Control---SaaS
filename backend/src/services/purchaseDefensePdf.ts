import PDFDocument from 'pdfkit';
import {
  PurchaseDefenseReport,
  DefenseCategorySection,
} from './purchaseDefenseService';
import {
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
  Doc,
} from './purchaseDefensePdfHelpers';

// =====================================================================
// Gerador do Relatório de Defesa de Compra (multi-categoria)
// =====================================================================

/** Capa: bloco azul cheio, título grande, escopo dinâmico, rodapé. */
function coverPage(doc: Doc, report: PurchaseDefenseReport): void {
  // Fundo azul cheio na página inteira (margem a margem da área útil)
  doc.save();
  doc.rect(PAGE.margin, PAGE.margin, CONTENT_W, PAGE.height - PAGE.margin * 2).fill(
    C.deepBlue,
  );

  const padX = PAGE.margin + 36;

  // Marca
  doc
    .fillColor(C.white)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('unifique', padX, PAGE.margin + 50, { lineBreak: false, continued: true })
    .fillColor('#9FB2E8')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('   TECNOLOGIA DA INFORMAÇÃO', { lineBreak: false });

  // Eyebrow
  const midY = PAGE.height * 0.42;
  doc
    .fillColor(C.cyan)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('RELATÓRIO TÉCNICO · TI UNIFIQUE', padX, midY, {
      characterSpacing: 1,
      lineBreak: false,
    });

  // Título grande
  doc
    .fillColor(C.white)
    .font('Helvetica-Bold')
    .fontSize(38)
    .text('Defesa de Compra de', padX, midY + 22, { width: CONTENT_W - 72 });
  doc
    .fillColor(C.white)
    .font('Helvetica-Bold')
    .fontSize(38)
    .text('Equipamentos', padX, doc.y, { width: CONTENT_W - 72 });

  // Escopo dinâmico (lista categorias + quantidades)
  const scopeParts = report.sections.map(
    (s) => `${s.suggestedQuantity} ${s.label}`,
  );
  const accCount = report.accessories.length;
  const scopeLine =
    scopeParts.join(' · ') + (accCount > 0 ? ` · ${accCount} tipo(s) de acessório` : '');

  doc
    .fillColor('#C8CEEA')
    .font('Helvetica')
    .fontSize(11)
    .text(scopeLine, padX, doc.y + 16, { width: CONTENT_W - 72 });

  const totalStr = `Análise do parque atual, descartes e justificativa para aquisição de ${report.totals.grandTotal} itens no total.`;
  doc
    .fillColor('#A8B4DC')
    .font('Helvetica')
    .fontSize(10)
    .text(totalStr, padX, doc.y + 8, { width: CONTENT_W - 72, lineGap: 2 });

  // Rodapé da capa
  const footY = PAGE.height - PAGE.margin - 36;
  doc
    .moveTo(padX, footY)
    .lineTo(PAGE.width - padX, footY)
    .lineWidth(0.5)
    .strokeColor('#4A4E9E')
    .stroke();
  doc
    .fillColor('#9FB2E8')
    .font('Helvetica')
    .fontSize(9)
    .text(
      `TI Unifique · ${report.meta.generatedByName} — ${roleDisplay(report.meta.generatedByRole)}     |     ${fmtDate(report.meta.generatedAt)}`,
      padX,
      footY + 10,
      { width: CONTENT_W - 72, lineBreak: false },
    );

  doc.restore();
}

/** Seção de uma categoria: header + KPIs + descartes + composição. */
function categorySection(
  doc: Doc,
  num: number,
  s: DefenseCategorySection,
): void {
  doc.addPage();

  sectionHeader(
    doc,
    num,
    `Sugestão de Compra — ${s.label}`,
    `Lote sugerido de ${s.suggestedQuantity} unidades · ${s.queue.total} em fila + ${s.safetyStock.quantity} de segurança`,
  );

  // KPIs mais relevantes da categoria
  kpiStrip(doc, [
    {
      value: String(s.suggestedQuantity),
      label: 'Sugestão de compra',
      desc: 'Total a adquirir',
    },
    {
      value: String(s.queue.total),
      label: 'Fila em aberto',
      desc: `${s.queue.newHires} novos + ${s.queue.replacement} substituição`,
    },
    {
      value: String(s.safetyStock.quantity),
      label: 'Estoque de segurança',
      desc: s.safetyStock.rationale ?? 'Reserva estratégica',
    },
    {
      value: String(s.stock.available),
      label: 'Saldo atual',
      desc: `${s.stock.totalActive} no parque · ${s.stock.damaged} em assistência`,
    },
  ]);

  // Texto-resumo
  const queueText =
    s.queue.total > 0
      ? `Há ${s.queue.total} chamados em aberto aguardando equipamento (${s.queue.newHires} de novos colaboradores e ${s.queue.replacement} de substituição). `
      : '';
  const safetyText =
    s.safetyStock.quantity > 0
      ? `O estoque de segurança de ${s.safetyStock.quantity} unidade(s)${s.safetyStock.rationale ? ` (${s.safetyStock.rationale})` : ''} compõe a reserva. `
      : '';
  paragraph(
    doc,
    `Solicita-se a aquisição de ${s.suggestedQuantity} ${s.label}. ${queueText}${safetyText}` +
      `O saldo disponível atual é de ${s.stock.available} unidade(s), com ${s.stock.damaged} em assistência.`,
  );

  // Composição do lote
  subTitle(doc, `Composição do lote de ${s.suggestedQuantity} ${s.label}`);
  const composeRows = [
    {
      destino: 'Fila em aberto (Acelerato)',
      qtd: String(s.queue.total),
      just: `${s.queue.newHires} novos colaboradores + ${s.queue.replacement} substituição`,
    },
    {
      destino: 'Estoque de segurança',
      qtd: String(s.safetyStock.quantity),
      just: s.safetyStock.rationale ?? 'Reserva estratégica',
    },
  ];
  styledTable(
    doc,
    [
      { label: 'Destino', key: 'destino', w: 32, align: 'left' },
      { label: 'Qtd.', key: 'qtd', w: 14, align: 'center' },
      { label: 'Justificativa', key: 'just', w: 54, align: 'left' },
    ],
    composeRows,
    {
      destino: 'TOTAL COMPOSTO',
      qtd: String(s.composedTotal),
      just: s.composedTotal === s.suggestedQuantity ? '' : `sugestão: ${s.suggestedQuantity}`,
    },
  );

  // Atribuições por intenção — o que sustenta a defesa pra diretoria.
  // Ex: "200 das 300 atribuições de Celulares foram Upgrade IFS".
  if (s.assignments.total > 0 && s.assignments.byIntent.length > 0) {
    const reasonLabel = (r: 'AUMENTO_QUADRO' | 'SUBSTITUICAO') =>
      r === 'AUMENTO_QUADRO' ? 'Aumento de quadro' : 'Substituição';

    subTitle(doc, `Atribuições por intenção — ${s.label}`);
    paragraph(
      doc,
      `No período foram ${s.assignments.total} atribuição(ões) de ${s.label}, ` +
        `das quais ${s.assignments.withIntent} com intenção registrada. ` +
        `O detalhamento abaixo sustenta a necessidade de reposição.`,
    );
    styledTable(
      doc,
      [
        { label: 'Intenção', key: 'intent', w: 40, align: 'left' },
        { label: 'Motivo', key: 'reason', w: 26, align: 'left' },
        { label: 'Qtd.', key: 'qtd', w: 12, align: 'center' },
        { label: '% do total', key: 'pct', w: 20, align: 'center' },
      ],
      s.assignments.byIntent.map((i) => ({
        intent: i.detail,
        reason: reasonLabel(i.reason),
        qtd: String(i.count),
        pct: `${i.pct.toFixed(1)}%`,
      })),
      {
        intent: 'COM INTENÇÃO REGISTRADA',
        reason: '',
        qtd: String(s.assignments.withIntent),
        pct: `${((s.assignments.withIntent / s.assignments.total) * 100).toFixed(1)}%`,
      },
    );

    const top = s.assignments.byIntent[0];
    calloutBox(
      doc,
      'Destaque:',
      `${top.count} de ${s.assignments.total} atribuições de ${s.label} ` +
        `(${top.pct.toFixed(0)}%) foram para "${top.detail}" — demanda concreta ` +
        `que justifica a aquisição.`,
      'info',
    );
  }

  // Último lote (contexto KACE)
  if (s.lastBatchQuantity > 0) {
    calloutBox(
      doc,
      'Último lote adquirido:',
      `${s.lastBatchQuantity} unidade(s) de ${s.label} no lote anterior (referência de rastreio).`,
      'info',
    );
  }

  // Grade de chamados do Acelerato (comprovação) — fiel ao template do
  // Jean: grade de 5 colunas com os números dos chamados. Só sai se a
  // categoria tem chamados informados (hoje, só o All in One usa).
  if (s.ticketNumbers.length > 0) {
    subTitle(
      doc,
      `Chamados em aberto — ${s.label} (${s.ticketNumbers.length} chamados Acelerato)`,
    );
    ticketsGrid(doc, s.ticketNumbers);
  }

  // Economia negociada DESTA categoria (se houver)
  if (s.commercial.totalSavings != null) {
    calloutBox(
      doc,
      'Economia negociada:',
      `${fmtBRL(s.commercial.discountPerUnit!)}/un. em lote de ${s.commercial.discountLotSize} unidades — economia de ${fmtBRL(s.commercial.totalSavings)} nesta categoria.`,
      'warn',
    );
  }
}

/** Grade de chamados em 5 colunas (imita o template): cabeçalho ciano
 *  "Chamado" repetido, células com os números, zebra por linha. */
function ticketsGrid(doc: Doc, tickets: string[]): void {
  const cols = 5;
  const x = PAGE.margin;
  const colW = CONTENT_W / cols;
  const headH = 22;
  const rowH = 20;

  // Cabeçalho (5x "Chamado")
  ensureSpace(doc, headH + rowH * 2);
  let y = doc.y;
  doc.save();
  doc.rect(x, y, CONTENT_W, headH).fill(C.cyan);
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(8.5);
  for (let i = 0; i < cols; i++) {
    doc.text('Chamado', x + i * colW, y + (headH - 9) / 2, {
      width: colW,
      align: 'center',
      lineBreak: false,
    });
  }
  doc.restore();
  y += headH;

  // Linhas em blocos de 5
  doc.font('Helvetica').fontSize(9);
  const totalRows = Math.ceil(tickets.length / cols);
  for (let r = 0; r < totalRows; r++) {
    if (y + rowH > PAGE.height - PAGE.margin - 30) {
      doc.addPage();
      y = doc.y;
    }
    if (r % 2 === 1) {
      doc.save();
      doc.rect(x, y, CONTENT_W, rowH).fill(C.zebra);
      doc.restore();
    }
    doc.fillColor(C.text);
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= tickets.length) break;
      doc.text(tickets[idx], x + c * colW, y + (rowH - 9) / 2, {
        width: colW,
        align: 'center',
        lineBreak: false,
        ellipsis: true,
      });
    }
    doc
      .moveTo(x, y + rowH)
      .lineTo(x + CONTENT_W, y + rowH)
      .lineWidth(0.3)
      .strokeColor(C.border)
      .stroke();
    y += rowH;
  }
  doc.y = y + 8;
  doc.x = PAGE.margin;
}

/** Seção agregada Descarte e Doação — Parque Antigo (fiel ao template). */
function disposalSection(
  doc: Doc,
  num: number,
  report: PurchaseDefenseReport,
): void {
  const d = report.disposal;
  if (!d) return;
  doc.addPage();

  sectionHeader(
    doc,
    num,
    'Descarte e Doação — Parque Antigo',
    `${d.totalProcessed} unidades processadas no período`,
  );

  // 4 KPIs: Total Processado / Descarte / Doação / Fora do Padrão
  kpiStrip(doc, [
    {
      value: String(d.totalProcessed),
      label: 'Total Processado',
      desc: 'Equipamentos do parque antigo',
    },
    {
      value: String(d.discardTotal),
      label: 'Descarte',
      desc: `${d.discardPct.toFixed(1)}% do total`,
    },
    {
      value: String(d.donationQuantity),
      label: 'Doação',
      desc: `${d.donationPct.toFixed(1)}% do total`,
    },
    {
      value: String(d.outOfStandardQuantity),
      label: 'Fora do Padrão',
      desc: 'CPU abaixo da 8ª geração Intel',
    },
  ]);

  paragraph(
    doc,
    `Equipamentos do parque antigo processados no período. Do total de ` +
      `${d.totalProcessed} unidade(s), ${d.discardTotal} foram destinadas a ` +
      `descarte e ${d.donationQuantity} a doação. Principal critério: ` +
      `obsolescência tecnológica — processadores abaixo da 8ª geração Intel.`,
  );

  // Tabela: Destinação Final
  subTitle(doc, 'Destinação Final');
  styledTable(
    doc,
    [
      { label: 'Destinação', key: 'dest', w: 40, align: 'left' },
      { label: 'Qtd.', key: 'qtd', w: 20, align: 'center' },
      { label: '% do Total', key: 'pct', w: 24, align: 'center' },
      { label: 'Status', key: 'status', w: 24, align: 'center' },
    ],
    [
      {
        dest: 'Descarte',
        qtd: String(d.discardTotal),
        pct: `${d.discardPct.toFixed(1)}%`,
        status: 'Concluído',
      },
      {
        dest: 'Doação',
        qtd: String(d.donationQuantity),
        pct: `${d.donationPct.toFixed(1)}%`,
        status: 'Concluído',
      },
    ],
    {
      dest: 'TOTAL',
      qtd: String(d.totalProcessed),
      pct: '100%',
      status: '—',
    },
  );

  // Tabela: Motivo do Descarte (do banco, agrupado)
  if (d.reasons.length > 0) {
    subTitle(doc, 'Motivo do Descarte');
    const reasonTotal = d.reasons.reduce((s, r) => s + r.count, 0);
    styledTable(
      doc,
      [
        { label: 'Motivo', key: 'motivo', w: 60, align: 'left' },
        { label: 'Qtd.', key: 'qtd', w: 20, align: 'center' },
        { label: '% do Total', key: 'pct', w: 20, align: 'center' },
      ],
      d.reasons.map((r) => ({
        motivo: r.reason,
        qtd: String(r.count),
        pct: `${r.pct.toFixed(1)}%`,
      })),
      {
        motivo: 'TOTAL',
        qtd: String(reasonTotal),
        pct: '100%',
      },
    );
    calloutBox(
      doc,
      'Nota:',
      'Os motivos refletem o que foi registrado em cada descarte no sistema. ' +
        'A doação é contabilizada à parte (não rastreada individualmente).',
      'info',
    );
  }
}
function accessoriesSection(
  doc: Doc,
  num: number,
  report: PurchaseDefenseReport,
): void {
  if (report.accessories.length === 0) return;
  doc.addPage();
  sectionHeader(
    doc,
    num,
    'Acessórios',
    `${report.accessories.length} tipo(s) · ${report.totals.accessoriesTotal} unidade(s) no total`,
  );
  styledTable(
    doc,
    [
      { label: 'Acessório', key: 'nome', w: 40, align: 'left' },
      { label: 'Qtd.', key: 'qtd', w: 14, align: 'center' },
      { label: 'Observação', key: 'obs', w: 46, align: 'left' },
    ],
    report.accessories.map((a) => ({
      nome: a.name,
      qtd: String(a.quantity),
      obs: a.note ?? '—',
    })),
    {
      nome: 'TOTAL ACESSÓRIOS',
      qtd: String(report.totals.accessoriesTotal),
      obs: '',
    },
  );
}

/** Resumo geral consolidado: tabela de tudo + condição comercial. */
function summarySection(
  doc: Doc,
  num: number,
  report: PurchaseDefenseReport,
): void {
  doc.addPage();
  sectionHeader(
    doc,
    num,
    'Resumo Geral da Compra Sugerida',
    'Total consolidado · todos os equipamentos e acessórios',
  );

  // KPIs consolidados (até 4 categorias)
  const catKpis = report.sections.slice(0, 3).map((s) => ({
    value: String(s.suggestedQuantity),
    label: s.label,
    desc: `${s.queue.total} fila + ${s.safetyStock.quantity} segurança`,
  }));
  catKpis.push({
    value: String(report.totals.grandTotal),
    label: 'Total geral',
    desc: 'Equipamentos + acessórios',
  });
  kpiStrip(doc, catKpis);

  // Tabela consolidada
  subTitle(doc, 'Tabela consolidada');
  const rows = report.sections.map((s) => ({
    item: s.label,
    qtd: String(s.suggestedQuantity),
    obs: `${s.queue.total} fila + ${s.safetyStock.quantity} segurança`,
  }));
  report.accessories.forEach((a) => {
    rows.push({ item: a.name, qtd: String(a.quantity), obs: a.note ?? '—' });
  });
  styledTable(
    doc,
    [
      { label: 'Equipamento / Acessório', key: 'item', w: 46, align: 'left' },
      { label: 'Qtd.', key: 'qtd', w: 14, align: 'center' },
      { label: 'Observação', key: 'obs', w: 40, align: 'left' },
    ],
    rows,
    {
      item: 'TOTAL DE EQUIPAMENTOS E ACESSÓRIOS',
      qtd: String(report.totals.grandTotal),
      obs: '',
    },
  );

  // Condição comercial (economia) — soma das economias por categoria
  const savingsCats = report.sections.filter(
    (s) => s.commercial.totalSavings != null,
  );
  if (savingsCats.length > 0 && report.totals.totalSavings > 0) {
    subTitle(doc, 'Condições comerciais relevantes');
    styledTable(
      doc,
      [
        { label: 'Categoria', key: 'cat', w: 34, align: 'left' },
        { label: 'Desconto', key: 'desc', w: 40, align: 'left' },
        { label: 'Economia', key: 'econ', w: 26, align: 'right' },
      ],
      savingsCats.map((s) => ({
        cat: s.label,
        desc: `${fmtBRL(s.commercial.discountPerUnit!)}/un. × ${s.commercial.discountLotSize}`,
        econ: fmtBRL(s.commercial.totalSavings!),
      })),
      {
        cat: 'ECONOMIA TOTAL',
        desc: '',
        econ: fmtBRL(report.totals.totalSavings),
      },
    );
    calloutBox(
      doc,
      'Atenção — condição comercial:',
      `Descontos condicionados ao fechamento dos lotes completos. Compras ` +
        `fracionadas perdem essa condição — custo adicional de ${fmtBRL(report.totals.totalSavings)}.`,
      'warn',
    );
  }

  // Conclusão
  const catSummary = report.sections
    .map((s) => `${s.suggestedQuantity} ${s.label}`)
    .join(', ');
  calloutBox(
    doc,
    'Conclusão:',
    `A aquisição de ${report.totals.grandTotal} itens (${catSummary}` +
      (report.accessories.length > 0 ? ` + ${report.totals.accessoriesTotal} acessórios` : '') +
      `) é justificada pela fila de chamados em aberto, estoque de segurança e reposição do parque. ` +
      `Elaborado por ${report.meta.generatedByName} — ${roleDisplay(report.meta.generatedByRole)}.`,
    'info',
  );
}

export async function buildPurchaseDefensePdf(
  report: PurchaseDefenseReport,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: PAGE.margin,
          bottom: PAGE.margin,
          left: PAGE.margin,
          right: PAGE.margin,
        },
        info: { Title: 'Defesa de Compra de Equipamentos — TI Unifique' },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Capa
      coverPage(doc, report);

      // Uma seção por categoria
      let sectionNum = 1;
      for (const s of report.sections) {
        categorySection(doc, sectionNum, s);
        sectionNum += 1;
      }

      // Seção agregada de descarte e doação (se informada)
      if (report.disposal) {
        disposalSection(doc, sectionNum, report);
        sectionNum += 1;
      }

      // Acessórios (se houver)
      if (report.accessories.length > 0) {
        accessoriesSection(doc, sectionNum, report);
        sectionNum += 1;
      }

      // Resumo geral
      summarySection(doc, sectionNum, report);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
