import { Router } from 'express';
import { canManageUsers } from '../middleware/rbac';
import {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
} from '../validation/schemas';
import {
  listUsers,
  createUser,
  updateUser,
  listAccessLogs,
} from '../services/userService';

const router = Router();

// Listar todos os usuários (ativos primeiro).
router.get('/', canManageUsers, async (_req, res, next) => {
  try {
    res.json(await listUsers());
  } catch (err) {
    next(err);
  }
});

// Trilha de auditoria de acessos (quem concedeu/alterou/revogou acesso).
// Vem ANTES de rotas com :id pra não colidir com o parâmetro.
router.get('/access-logs', canManageUsers, async (_req, res, next) => {
  try {
    res.json(await listAccessLogs());
  } catch (err) {
    next(err);
  }
});

// Criar novo usuário (nome, e-mail, papel).
router.post('/', canManageUsers, async (req, res, next) => {
  try {
    const input = createUserSchema.parse(req.body);
    res.status(201).json(await createUser(input, req.user!));
  } catch (err) {
    next(err);
  }
});

// Atualizar papel ou status ativo de um usuário.
router.patch('/:id', canManageUsers, async (req, res, next) => {
  try {
    const { id } = userIdParamSchema.parse(req.params);
    const input = updateUserSchema.parse(req.body);
    res.json(await updateUser(id, input, req.user!));
  } catch (err) {
    next(err);
  }
});

export default router;
