import ExcelJS from 'exceljs';
import { PurchaseJustificationReport } from './purchaseJustificationService';

// =====================================================================
// XLSX do Relatório de Justificativa de Compra
// =====================================================================
// Mesma informação do PDF, em abas separadas pra contabilidade cruzar
// com dados externos. Todas as células de texto passam por safeCell
// pra neutralizar injeção de fórmula (CWE-1236).
// =====================================================================

function safeCell(v: string | null | undefined): string {
  const s = (v ?? '').toString();
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

function fmtDateTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const ROLE_LABEL: Record<string, string> = {
  OPERADOR_N1: 'Operador N1',
  LIDER_N1: 'Líder N1',
  DIRETOR_TI: 'Diretor de TI',
};
const CATEGORY_LABEL: Record<string, string> = {
  Notebook: 'Notebooks',
  Desktop: 'Desktops',
  Celular: 'Celulares',
  AllInOne: 'All-in-Ones',
  Periferico: 'Periféricos',
};

export async function buildPurchaseJustificationXlsx(
  report: PurchaseJustificationReport,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Control';
  wb.created = new Date();

  // === Aba 1: Resumo ===
  const ws1 = wb.addWorksheet('Resumo');
  ws1.columns = [
    { header: 'Métrica', key: 'k', width: 36 },
    { header: 'Valor', key: 'v', width: 50 },
  ];
  ws1.getRow(1).font = { bold: true };

  const meta = report.meta;
  ws1.addRows([
    { k: 'Categoria', v: safeCell(CATEGORY_LABEL[meta.category] ?? meta.category) },
    { k: 'Período (início)', v: fmtDate(meta.periodStart) },
    { k: 'Período (fim)', v: fmtDate(meta.periodEnd) },
    { k: 'Gerado por', v: safeCell(`${meta.generatedByName} (${ROLE_LABEL[meta.generatedByRole] ?? meta.generatedByRole})`) },
    { k: 'Gerado em', v: fmtDateTime(meta.generatedAt) },
    { k: '', v: '' },
    { k: 'SOLICITAÇÃO — Quantidade a adquirir', v: report.recommendation.quantity },
    { k: '', v: '' },
    { k: 'Justificativa', v: safeCell(report.recommendation.summary) },
  ]);

  // === Aba 2: Saldo atual ===
  const ws2 = wb.addWorksheet('Saldo Atual');
  ws2.columns = [
    { header: 'Status', key: 's', width: 20 },
    { header: 'Quantidade', key: 'q', width: 14 },
  ];
  ws2.getRow(1).font = { bold: true };
  ws2.addRows([
    { s: 'Disponível', q: report.currentStock.available },
    { s: 'Em Uso', q: report.currentStock.inUse },
    { s: 'Danificado', q: report.currentStock.damaged },
    { s: 'Total ativo', q: report.currentStock.totalActive },
  ]);
  if (report.currentStock.isCritical) {
    ws2.addRow([]);
    ws2.addRow(['⚠ Saldo crítico — disponível insuficiente para cobrir descartes e danificados.']);
  }

  // === Aba 3: Movimentações ===
  const ws3 = wb.addWorksheet('Movimentações');
  ws3.columns = [
    { header: 'Mês', key: 'm', width: 12 },
    { header: 'Atribuições', key: 'a', width: 14 },
    { header: 'Devoluções', key: 'd', width: 14 },
    { header: 'Reaproveitamentos', key: 'r', width: 18 },
  ];
  ws3.getRow(1).font = { bold: true };
  for (const row of report.movements.byMonth) {
    ws3.addRow({ m: row.month, a: row.assignments, d: row.returns, r: row.reassignments });
  }
  ws3.addRow([]);
  ws3.addRow({
    m: 'TOTAL',
    a: report.movements.assignments,
    d: report.movements.returns,
    r: report.movements.reassignments,
  }).font = { bold: true };

  // === Aba 4: Descartes ===
  const ws4 = wb.addWorksheet('Descartes');
  ws4.columns = [
    { header: 'Número de Série', key: 'sn', width: 26 },
    { header: 'Modelo', key: 'm', width: 32 },
    { header: 'Data', key: 'd', width: 14 },
    { header: 'Motivo', key: 'r', width: 60 },
    { header: 'Descartado por', key: 'by', width: 26 },
  ];
  ws4.getRow(1).font = { bold: true };
  for (const item of report.discards.items) {
    ws4.addRow({
      sn: safeCell(item.serialNumber),
      m: safeCell(item.model),
      d: fmtDate(item.discardedAt),
      r: safeCell(item.reason),
      by: safeCell(item.discardedByName),
    });
  }

  // === Aba 5: Quebras ===
  const ws5 = wb.addWorksheet('Quebras');
  ws5.columns = [
    { header: 'Métrica', key: 'k', width: 40 },
    { header: 'Quantidade', key: 'v', width: 14 },
  ];
  ws5.getRow(1).font = { bold: true };
  ws5.addRows([
    { k: 'Enviados à assistência (Spectra)', v: report.breakdownsAndRepairs.sentToRepair },
    { k: 'Voltaram reparados', v: report.breakdownsAndRepairs.returnedRepaired },
    { k: 'Condenados/descartados após reparo', v: report.breakdownsAndRepairs.condemnedAfterRepair },
  ]);

  // === Aba 6: Defeitos Frequentes ===
  const ws6 = wb.addWorksheet('Defeitos Frequentes');
  ws6.columns = [
    { header: 'Tipo de defeito', key: 'l', width: 36 },
    { header: 'Ocorrências', key: 'c', width: 14 },
  ];
  ws6.getRow(1).font = { bold: true };
  for (const d of report.breakdownsAndRepairs.frequentDefects) {
    ws6.addRow({ l: safeCell(d.label), c: d.count });
  }

  // === Aba 7: Setores que mais danificam ===
  const ws7 = wb.addWorksheet('Setores com Danos');
  ws7.columns = [
    { header: 'Setor', key: 'd', width: 30 },
    { header: 'Quebras', key: 'c', width: 14 },
  ];
  ws7.getRow(1).font = { bold: true };
  for (const s of report.breakdownsAndRepairs.topDamageSectors) {
    ws7.addRow({ d: safeCell(s.department), c: s.count });
  }

  // === Aba 8: Distribuição por setor ===
  const ws8 = wb.addWorksheet('Distribuição por Setor');
  ws8.columns = [
    { header: 'Setor', key: 'd', width: 30 },
    { header: 'Em uso', key: 'c', width: 14 },
  ];
  ws8.getRow(1).font = { bold: true };
  for (const s of report.distributionBySector) {
    ws8.addRow({ d: safeCell(s.department), c: s.count });
  }

  // === Aba 9: Detalhamento por modelo (só Periféricos) ===
  if (report.byModel && report.byModel.length > 0) {
    const ws9 = wb.addWorksheet('Por Modelo');
    ws9.columns = [
      { header: 'Modelo', key: 'm', width: 40 },
      { header: 'Quantidade', key: 'q', width: 14 },
    ];
    ws9.getRow(1).font = { bold: true };
    for (const m of report.byModel) {
      ws9.addRow({ m: safeCell(m.model), q: m.count });
    }
  }

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}
