import ExcelJS from 'exceljs';
import { prisma } from '../db/prisma';

/**
 * Feed de correções para supervisores (líderes e acima): toda edição e
 * anulação de lançamentos, com autor, motivo e diff. Ordem mais recente
 * primeiro.
 */
export async function listCorrections(limit = 200) {
  const corrections = await prisma.movementLogCorrection.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 500),
    include: {
      movementLog: {
        select: { id: true, assetSerialNumber: true },
      },
    },
  });

  return corrections.map((c) => ({
    id: c.id,
    operation: c.operation,
    reason: c.reason,
    changes: c.changes,
    actorName: c.actorName,
    actorRole: c.actorRole,
    createdAt: c.createdAt,
    movementLogId: c.movementLogId,
    assetSerialNumber: c.movementLog.assetSerialNumber,
  }));
}

/** Lista os registros de descarte (para a tela e a exportação). */
export async function listDiscarded(onlyDamaged = false) {
  return prisma.discardRecord.findMany({
    where: onlyDamaged ? { lastStatus: 'Danificado' } : undefined,
    orderBy: { discardedAt: 'desc' },
  });
}

/**
 * Neutraliza injeção de fórmula em planilhas (CWE-1236): valores que
 * começam com = + - @ podem ser interpretados como fórmula por Excel/
 * Sheets. Prefixamos com aspa simples para forçar texto.
 */
function safeCell(value: string | null | undefined): string {
  const v = (value ?? '').toString();
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}

/**
 * Gera a "Planilha de equipamentos descartados" como um .xlsx em buffer.
 * Cada linha = um descarte (snapshot SN + modelo + contexto).
 */
export async function buildDiscardWorkbook(onlyDamaged = false): Promise<Buffer> {
  const records = await listDiscarded(onlyDamaged);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Control';
  wb.created = new Date();
  const ws = wb.addWorksheet('Descartados');

  ws.columns = [
    { header: 'Número de Série', key: 'serial', width: 26 },
    { header: 'Modelo', key: 'model', width: 32 },
    { header: 'Categoria', key: 'category', width: 16 },
    { header: 'Último Status', key: 'status', width: 16 },
    { header: 'Motivo do Descarte', key: 'reason', width: 48 },
    { header: 'Descartado Por', key: 'by', width: 28 },
    { header: 'Data do Descarte', key: 'at', width: 22 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };

  for (const r of records) {
    ws.addRow({
      serial: safeCell(r.serialNumber),
      model: safeCell(r.model),
      category: safeCell(r.category),
      status: safeCell(r.lastStatus),
      reason: safeCell(r.reason),
      by: safeCell(r.discardedByName),
      at: r.discardedAt.toISOString().slice(0, 19).replace('T', ' '),
    });
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
