import { Router } from 'express';
import { canWriteAssets, anyAuthenticated } from '../middleware/rbac';
import {
  listPendencies,
  resolvePendency,
  cancelPendency,
} from '../services/pendencyService';

// Pendências de periférico. Leitura pra qualquer autenticado; resolver/
// cancelar exige permissão de escrita (Operador/Líder).
const router = Router();

router.get('/', anyAuthenticated, async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(await listPendencies(status));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resolve', canWriteAssets, async (req, res, next) => {
  try {
    res.json(await resolvePendency(Number(req.params.id), req.user!));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', canWriteAssets, async (req, res, next) => {
  try {
    res.json(await cancelPendency(Number(req.params.id), req.user!));
  } catch (err) {
    next(err);
  }
});

export default router;
