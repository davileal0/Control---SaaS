import { Router, json } from 'express';
import { canWriteAssets, canReadReports } from '../middleware/rbac';
import {
  inventoryValidateSchema,
  createImportSchema,
  rejectImportSchema,
} from '../validation/schemas';
import {
  parseAndValidateInventory,
  createImportRequest,
  listImportRequests,
  getImportRequest,
  approveImportRequest,
  rejectImportRequest,
} from '../services/inventoryImportService';

// =====================================================================
// Importação de Inventário — rotas (Fases 1 e 2)
// =====================================================================
// Fase 1: POST /validate  → só valida a planilha (não persiste).
// Fase 2: pedido de importação com aprovação.
//   POST /                → operador cria pedido (planilha + link Autentique)
//   GET  /                → lista pedidos
//   GET  /:id             → detalhe
//   POST /:id/approve     → gestor aprova (cria os ativos)
//   POST /:id/reject      → gestor recusa (com motivo)

const router = Router();

// Planilhas são pequenas, mas base64 infla ~33%; 8mb cobre com folga.
const inventoryJson = json({ limit: '8mb' });

function base64ToBuffer(fileBase64: string): Buffer {
  const b64 = fileBase64.includes(',')
    ? fileBase64.slice(fileBase64.indexOf(',') + 1)
    : fileBase64;
  return Buffer.from(b64, 'base64');
}

// --- FASE 1: validação (sem persistir) ---
router.post('/validate', inventoryJson, canWriteAssets, async (req, res, next) => {
  try {
    const { fileBase64 } = inventoryValidateSchema.parse(req.body);
    const result = await parseAndValidateInventory(base64ToBuffer(fileBase64));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- FASE 2: criar pedido (operador) ---
router.post('/', inventoryJson, canWriteAssets, async (req, res, next) => {
  try {
    const { fileBase64, autentiqueLink } = createImportSchema.parse(req.body);
    const imp = await createImportRequest(
      base64ToBuffer(fileBase64),
      autentiqueLink,
      req.user!,
    );
    res.status(201).json(imp);
  } catch (err) {
    next(err);
  }
});

// --- FASE 2: listar pedidos ---
router.get('/', canWriteAssets, async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(await listImportRequests(status));
  } catch (err) {
    next(err);
  }
});

// --- FASE 2: detalhe de um pedido ---
router.get('/:id', canWriteAssets, async (req, res, next) => {
  try {
    res.json(await getImportRequest(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
});

// --- FASE 2: aprovar (gestor: Líder ou Coordenador) ---
router.post('/:id/approve', canReadReports, async (req, res, next) => {
  try {
    const result = await approveImportRequest(Number(req.params.id), req.user!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- FASE 2: recusar (gestor: Líder ou Coordenador) ---
router.post('/:id/reject', canReadReports, async (req, res, next) => {
  try {
    const { reason } = rejectImportSchema.parse(req.body);
    const imp = await rejectImportRequest(Number(req.params.id), reason, req.user!);
    res.json(imp);
  } catch (err) {
    next(err);
  }
});

export default router;
