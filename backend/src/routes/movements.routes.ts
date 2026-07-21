import { Router } from 'express';
import { canWriteAssets } from '../middleware/rbac';
import {
  transitionSchema,
  discardSchema,
  editMovementSchema,
  voidMovementSchema,
  serialParamSchema,
  logIdParamSchema,
  reassignSchema,
} from '../validation/schemas';
import {
  registerMovement,
  discardAsset,
  editMovement,
  voidMovement,
  reassignAsset,
} from '../services/movementService';

const router = Router();

// Registrar movimentação / transição de status (Fluxos A, B, C).
router.post('/:serial/movements', canWriteAssets, async (req, res, next) => {
  try {
    const { serial } = serialParamSchema.parse(req.params);
    const input = transitionSchema.parse(req.body);
    res.status(201).json(await registerMovement(serial, input, req.user!));
  } catch (err) {
    next(err);
  }
});

// Editar metadados de um lançamento (com justificativa obrigatória).
router.patch('/movements/:id', canWriteAssets, async (req, res, next) => {
  try {
    const { id } = logIdParamSchema.parse(req.params);
    const input = editMovementSchema.parse(req.body);
    res.json(await editMovement(id, input, req.user!));
  } catch (err) {
    next(err);
  }
});

// Anular (remover logicamente) um lançamento feito por engano.
router.post('/movements/:id/void', canWriteAssets, async (req, res, next) => {
  try {
    const { id } = logIdParamSchema.parse(req.params);
    const input = voidMovementSchema.parse(req.body);
    res.json(await voidMovement(id, input, req.user!));
  } catch (err) {
    next(err);
  }
});

// Descartar ativo (exclusão lógica + registro na planilha de descartados).
router.post('/:serial/discard', canWriteAssets, async (req, res, next) => {
  try {
    const { serial } = serialParamSchema.parse(req.params);
    const input = discardSchema.parse(req.body);
    res.status(201).json(await discardAsset(serial, input, req.user!));
  } catch (err) {
    next(err);
  }
});

// Reaproveitamento direto: dois lançamentos atômicos (devolução do
// anterior + nova atribuição) na mesma transação. Fluxo D do MVP.
router.post('/:serial/reassign', canWriteAssets, async (req, res, next) => {
  try {
    const { serial } = serialParamSchema.parse(req.params);
    const input = reassignSchema.parse(req.body);
    res.status(201).json(await reassignAsset(serial, input, req.user!));
  } catch (err) {
    next(err);
  }
});

export default router;
