import { Router } from 'express';
import { anyAuthenticated, canReadReports } from '../middleware/rbac';
import {
  getActiveMetrics,
  getStockByModel,
  getPeripheralBreakdown,
} from '../services/dashboardService';

const router = Router();

// Métricas ativas do dashboard (todos os perfis leem).
router.get('/metrics', anyAuthenticated, async (_req, res, next) => {
  try {
    res.json(await getActiveMetrics());
  } catch (err) {
    next(err);
  }
});

// Widget "Periféricos Gerais": contagem por model.
router.get('/peripherals', anyAuthenticated, async (_req, res, next) => {
  try {
    res.json(await getPeripheralBreakdown());
  } catch (err) {
    next(err);
  }
});

// Consolidado de estoque por modelo (visão gerencial: Líder e Diretor).
router.get('/stock', canReadReports, async (_req, res, next) => {
  try {
    res.json(await getStockByModel());
  } catch (err) {
    next(err);
  }
});

export default router;
