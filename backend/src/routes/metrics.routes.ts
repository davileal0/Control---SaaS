import { Router } from 'express';
import { anyAuthenticated } from '../middleware/rbac';
import {
  getOperatorMetrics,
  getLeaderMetrics,
  getDirectorMetrics,
} from '../services/metricsService';
import {
  getActivityFeed,
  getTodayMovements,
  getAssignmentMovements,
} from '../services/activityFeedService';

const router = Router();

// Todos os endpoints aceitam qualquer papel autenticado.
// Razão: o Diretor (Tiago) usa o botão "Visualizar como Operador N1"
// pra testar a UX dos subordinados — precisa conseguir consultar
// /operator mesmo sendo Diretor. RBAC fino em métricas (leitura)
// não adiciona segurança porque os dados não são sensíveis.

router.get('/operator', anyAuthenticated, async (_req, res, next) => {
  try {
    res.json(await getOperatorMetrics());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[metrics/operator] ERRO DETALHADO:', err);
    next(err);
  }
});

router.get('/leader', anyAuthenticated, async (_req, res, next) => {
  try {
    res.json(await getLeaderMetrics());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[metrics/leader] ERRO DETALHADO:', err);
    next(err);
  }
});

router.get('/director', anyAuthenticated, async (_req, res, next) => {
  try {
    res.json(await getDirectorMetrics());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[metrics/director] ERRO DETALHADO:', err);
    next(err);
  }
});

// Feed de movimentações recentes — todos os papéis veem (P3).
// ?limit=N controla a quantidade (default 6 pro card; "ver todas" pede mais).
router.get('/activity-feed', anyAuthenticated, async (req, res, next) => {
  try {
    const rawLimit = Number(req.query.limit);
    // Sanitiza: entre 1 e 100, default 6
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), 100)
        : 6;
    res.json(await getActivityFeed(limit));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[metrics/activity-feed] ERRO DETALHADO:', err);
    next(err);
  }
});

// Movimentações de HOJE (detalhe do card "Movimentações hoje"). Mesmo
// filtro do KPI, então a lista bate com o número. Todos os papéis.
router.get('/movements-today', anyAuthenticated, async (_req, res, next) => {
  try {
    res.json(await getTodayMovements());
  } catch (err) {
    next(err);
  }
});

// Atribuições de ativos rastreáveis a chamados (página Movimentações).
router.get('/assignments', anyAuthenticated, async (_req, res, next) => {
  try {
    res.json(await getAssignmentMovements());
  } catch (err) {
    next(err);
  }
});

export default router;
