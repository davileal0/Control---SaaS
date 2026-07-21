import { Router } from 'express';
import { canWriteAssets, anyAuthenticated } from '../middleware/rbac';
import {
  createAssetSchema,
  createEquipmentsBulkSchema,
  listFiltersSchema,
} from '../validation/schemas';
import {
  createAsset,
  createEquipmentsBulkFromRaw,
  listActiveAssets,
  getPeripheralTypeAvailability,
} from '../services/assetService';

const router = Router();

// Estoque disponível por tipo de periférico (painel de entrega de kit).
// Rota estática ANTES de qualquer '/:algo' pra evitar captura indevida.
router.get('/peripherals/stock', anyAuthenticated, async (_req, res, next) => {
  try {
    res.json(await getPeripheralTypeAvailability());
  } catch (err) {
    next(err);
  }
});

// Listar ativos com filtros (status, categoria, busca textual).
router.get('/', anyAuthenticated, async (req, res, next) => {
  try {
    const filters = listFiltersSchema.parse(req.query);
    res.json(await listActiveAssets(filters));
  } catch (err) {
    next(err);
  }
});

// Cadastrar novo ativo (Operador e Líder).
router.post('/', canWriteAssets, async (req, res, next) => {
  try {
    const input = createAssetSchema.parse(req.body);
    const asset = await createAsset(input, req.user!);
    res.status(201).json(asset);
  } catch (err) {
    next(err);
  }
});

// Cadastro de equipamentos em massa via lista de SNs colada.
router.post('/bulk-equipment', canWriteAssets, async (req, res, next) => {
  try {
    const input = createEquipmentsBulkSchema.parse(req.body);
    const result = await createEquipmentsBulkFromRaw(
      input.category,
      input.model,
      input.serialNumbersRaw,
      req.user!,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
