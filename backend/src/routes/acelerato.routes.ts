import { Router } from 'express';
import { anyAuthenticated } from '../middleware/rbac';
import {
  getAceleratoTicket,
  isAceleratoConfigured,
} from '../services/aceleratoService';

// =====================================================================
// Integração Acelerato — leitura de chamados
// =====================================================================
// Qualquer usuário autenticado pode consultar (o nº do chamado já é
// registrado nas movimentações). Só leitura por enquanto.

const router = Router();

// Diz ao front se a integração está ligada (pra decidir se mostra o
// bloco de chamado / esconde botões).
router.get('/status', anyAuthenticated, (_req, res) => {
  res.json({ configured: isAceleratoConfigured() });
});

// Detalhe de um chamado pelo número.
router.get('/tickets/:id', anyAuthenticated, async (req, res, next) => {
  try {
    res.json(await getAceleratoTicket(req.params.id));
  } catch (err) {
    next(err);
  }
});

export default router;
