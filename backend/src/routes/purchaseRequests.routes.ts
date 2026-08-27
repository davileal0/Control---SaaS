import { Router } from 'express';
import {
  canAuthorizePurchaseRequest,
  canOpenPurchaseRequest,
  canClosePurchaseRequest,
  canViewPurchaseRequests,
} from '../middleware/rbac';
import {
  authorizePurchaseRequestSchema,
  closePurchaseRequestSchema,
  openPurchaseRequestSchema,
  purchaseRequestFiltersSchema,
  purchaseRequestIdParamSchema,
} from '../validation/schemas';
import {
  listPurchaseRequests,
  authorizePurchaseRequest,
  openPurchaseRequest,
  closePurchaseRequest,
} from '../services/purchaseRequestService';

const router = Router();

// Listar SCs (todos os usuários autenticados — transparência operacional).
router.get('/', canViewPurchaseRequests, async (req, res, next) => {
  try {
    const filters = purchaseRequestFiltersSchema.parse(req.query);
    res.json(await listPurchaseRequests(filters));
  } catch (err) {
    next(err);
  }
});

// Autorizar nova SC. Líder/Diretor.
router.post('/', canAuthorizePurchaseRequest, async (req, res, next) => {
  try {
    const input = authorizePurchaseRequestSchema.parse(req.body);
    res.status(201).json(await authorizePurchaseRequest(input, req.user!));
  } catch (err) {
    next(err);
  }
});

// Abrir SC — Heryck registra o número emitido. Operador/Líder/Diretor.
router.patch(
  '/:id/open',
  canOpenPurchaseRequest,
  async (req, res, next) => {
    try {
      const { id } = purchaseRequestIdParamSchema.parse(req.params);
      const input = openPurchaseRequestSchema.parse(req.body);
      res.json(await openPurchaseRequest(id, input, req.user!));
    } catch (err) {
      next(err);
    }
  },
);

// Fechar (manual) ou cancelar SC. Operador (Heryck)/Líder/Diretor.
router.patch(
  '/:id/close',
  canClosePurchaseRequest,
  async (req, res, next) => {
    try {
      const { id } = purchaseRequestIdParamSchema.parse(req.params);
      const input = closePurchaseRequestSchema.parse(req.body);
      res.json(await closePurchaseRequest(id, input, req.user!));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
