import { Router } from 'express';
import { anyAuthenticated, canManageUsers } from '../middleware/rbac';
import {
  createUnitSchema,
  updateUnitSchema,
  unitIdParamSchema,
} from '../validation/schemas';
import { listUnits, createUnit, updateUnit } from '../services/unitService';

// =====================================================================
// Unidades físicas (filiais)
// =====================================================================
// Leitura: qualquer autenticado (seleção em cadastro/movimentações).
// Gestão (criar/renomear/desativar): Líder e Diretor (mesma faixa da
// gestão de usuários), a partir de Configurações.

const router = Router();

router.get('/', anyAuthenticated, async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    res.json(await listUnits(includeInactive));
  } catch (err) {
    next(err);
  }
});

router.post('/', canManageUsers, async (req, res, next) => {
  try {
    const input = createUnitSchema.parse(req.body);
    res.status(201).json(await createUnit(input));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', canManageUsers, async (req, res, next) => {
  try {
    const { id } = unitIdParamSchema.parse(req.params);
    const input = updateUnitSchema.parse(req.body);
    res.json(await updateUnit(id, input));
  } catch (err) {
    next(err);
  }
});

export default router;
