import { Router } from 'express';
import { anyAuthenticated } from '../middleware/rbac';
import { serialParamSchema } from '../validation/schemas';
import { getAuditTimeline } from '../services/auditService';

const router = Router();

// Linha do tempo de auditoria de um serial (inclui arquivados).
// Acesso de leitura para todos os perfis — núcleo da consulta do Diretor.
router.get('/:serial', anyAuthenticated, async (req, res, next) => {
  try {
    const { serial } = serialParamSchema.parse(req.params);
    res.json(await getAuditTimeline(serial));
  } catch (err) {
    next(err);
  }
});

export default router;
