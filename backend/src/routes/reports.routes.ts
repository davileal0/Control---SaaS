import { Router } from 'express';
import { canReadReports, canGenerateJustification } from '../middleware/rbac';
import {
  listCorrections,
  listDiscarded,
  buildDiscardWorkbook,
} from '../services/reportsService';
import { generatePurchaseJustification } from '../services/purchaseJustificationService';
import { buildPurchaseJustificationPdf } from '../services/purchaseJustificationPdf';
import { buildPurchaseJustificationXlsx } from '../services/purchaseJustificationXlsx';
import { generatePurchaseDefenseReport } from '../services/purchaseDefenseService';
import { buildPurchaseDefensePdf } from '../services/purchaseDefensePdf';
import {
  purchaseJustificationFiltersSchema,
  purchaseDefenseReportSchema,
} from '../validation/schemas';
import { prisma } from '../db/prisma';

// Relatórios para supervisores (líderes e acima): trilha de correções e
// equipamentos descartados. Todos com RBAC de leitura gerencial.
const router = Router();

router.get('/corrections', canReadReports, async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(await listCorrections(limit));
  } catch (err) {
    next(err);
  }
});

router.get('/discarded', canReadReports, async (req, res, next) => {
  try {
    res.json(await listDiscarded(req.query.damaged === 'true'));
  } catch (err) {
    next(err);
  }
});

router.get('/discarded.xlsx', canReadReports, async (req, res, next) => {
  try {
    const buffer = await buildDiscardWorkbook(req.query.damaged === 'true');
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="equipamentos-descartados-${stamp}.xlsx"`,
    );
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// Relatório de Justificativa de Compra (Operador + Líder + Diretor)
// =====================================================================
// Resolve a identidade do gerador: em produção via SSO, o req.user.id
// é UUID — busca-se na tabela users. Em dev (DEV_NO_AUTH) o id é
// sintético ("dev-OPERADOR_N1") e usamos o email como nome de exibição.
async function resolveActor(req: Express.Request) {
  const u = (req as { user?: { id: string; email: string; role: string } }).user!;
  // Em dev (DEV_NO_AUTH), o id começa com 'dev-' e não existe na tabela.
  if (u.id.startsWith('dev-')) {
    return { fullName: u.email, role: u.role };
  }
  const real = await prisma.user.findUnique({ where: { id: u.id } });
  return {
    fullName: real?.fullName ?? u.email,
    role: real?.role ?? u.role,
  };
}

router.get('/purchase-justification', canGenerateJustification, async (req, res, next) => {
  try {
    const filters = purchaseJustificationFiltersSchema.parse(req.query);
    const actor = await resolveActor(req);
    res.json(await generatePurchaseJustification(filters, actor));
  } catch (err) {
    next(err);
  }
});

router.get('/purchase-justification.pdf', canGenerateJustification, async (req, res, next) => {
  try {
    const filters = purchaseJustificationFiltersSchema.parse(req.query);
    const actor = await resolveActor(req);
    const report = await generatePurchaseJustification(filters, actor);
    const pdf = await buildPurchaseJustificationPdf(report);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="justificativa-compra-${filters.category}-${stamp}.pdf"`,
    );
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

router.get('/purchase-justification.xlsx', canGenerateJustification, async (req, res, next) => {
  try {
    const filters = purchaseJustificationFiltersSchema.parse(req.query);
    const actor = await resolveActor(req);
    const report = await generatePurchaseJustification(filters, actor);
    const xlsx = await buildPurchaseJustificationXlsx(report);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="justificativa-compra-${filters.category}-${stamp}.xlsx"`,
    );
    res.send(xlsx);
  } catch (err) {
    next(err);
  }
});

// Relatório de Defesa de Compra (multi-categoria) — POST porque o input
// é grande e estruturado (categorias + acessórios + economia). Gera PDF.
router.post('/purchase-defense.pdf', canGenerateJustification, async (req, res, next) => {
  try {
    const input = purchaseDefenseReportSchema.parse(req.body);
    const actor = await resolveActor(req);
    const report = await generatePurchaseDefenseReport(input, actor);
    const pdf = await buildPurchaseDefensePdf(report);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="defesa-compra-${stamp}.pdf"`,
    );
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

export default router;
