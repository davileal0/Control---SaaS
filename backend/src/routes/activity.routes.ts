import { Router } from 'express';
import { canReadReports } from '../middleware/rbac';
import {
  getTeamActivity,
  getOperatorActivity,
} from '../services/activityService';
import { activityPeriodSchema } from '../validation/schemas';

// =====================================================================
// Painel de Atividade dos Operadores (Fase 2)
// =====================================================================
// Acesso gerencial (Líder + Coordenador) — mesma faixa dos relatórios.
// É apoio pra feedback individual, NÃO ranking. Só leitura/agregação.

const router = Router();

// Resumo de atividade de todos os operadores no período.
// GET /api/activity/team?periodStart=...&periodEnd=...
router.get('/team', canReadReports, async (req, res, next) => {
  try {
    const { periodStart, periodEnd } = activityPeriodSchema.parse(req.query);
    res.json(await getTeamActivity(periodStart, periodEnd));
  } catch (err) {
    next(err);
  }
});

// Extrato individual de um operador no período.
// GET /api/activity/operator/:actorUserId?periodStart=...&periodEnd=...
router.get('/operator/:actorUserId', canReadReports, async (req, res, next) => {
  try {
    const { periodStart, periodEnd } = activityPeriodSchema.parse(req.query);
    const { actorUserId } = req.params;
    res.json(await getOperatorActivity(actorUserId, periodStart, periodEnd));
  } catch (err) {
    next(err);
  }
});

export default router;
