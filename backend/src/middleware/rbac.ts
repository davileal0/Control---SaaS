import { NextFunction, Request, Response } from 'express';
import { Role } from '../domain/types';

// =====================================================================
// Autorização (RBAC) — negação por padrão
// =====================================================================
// Toda rota sensível declara explicitamente os papéis permitidos.
// Sem usuário autenticado ou papel fora da allowlist => 403.
//
// Mapa de capacidades (referência da especificação):
//   OPERADOR_N1 : escrever (cadastrar, movimentar, descartar) + ler
//   LIDER_N1    : tudo do operador + relatórios consolidados
//   DIRETOR_TI  : SOMENTE leitura (dashboards + trilha de auditoria)

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    if (!allowed.includes(user.role)) {
      return res
        .status(403)
        .json({ error: 'Seu perfil não tem permissão para esta ação.' });
    }
    return next();
  };
}

// Atalhos semânticos para uso nas rotas.
export const canWriteAssets = requireRole('OPERADOR_N1', 'LIDER_N1');
export const canReadReports = requireRole('LIDER_N1', 'DIRETOR_TI');
// Gerenciamento de usuários é responsabilidade administrativa do Diretor.
export const canManageUsers = requireRole('LIDER_N1', 'DIRETOR_TI');
// Relatório de Justificativa de Compra: liberado pros 3 papéis durante
// o MVP (você opera + desenvolve). Em produção, se desejar restringir,
// basta retirar OPERADOR_N1 da lista.
export const canGenerateJustification = requireRole(
  'OPERADOR_N1',
  'LIDER_N1',
  'DIRETOR_TI',
);
export const anyAuthenticated = requireRole(
  'OPERADOR_N1',
  'LIDER_N1',
  'DIRETOR_TI',
);

// =====================================================================
// Solicitações de Compra (SC)
// =====================================================================
// Autorizar (= cria SC em AGUARDANDO_ABERTURA): só quem decide.
//   Líder e Diretor autorizam aval da compra.
export const canAuthorizePurchaseRequest = requireRole(
  'LIDER_N1',
  'DIRETOR_TI',
);
// Abrir (= registrar número da SC + ir pra ABERTA): Heryck (Operador N1)
// e qualquer escalão superior. Heryck é quem normalmente faz isso, mas
// Líder/Diretor podem cobrir ausências.
export const canOpenPurchaseRequest = requireRole(
  'OPERADOR_N1',
  'LIDER_N1',
  'DIRETOR_TI',
);
// Fechar (=manual = recebimento, ou cancelar=correção de erro):
// Heryck pode fechar qualquer estado (com confirmação dupla na UI).
// Líder/Diretor podem cancelar/fechar livremente.
export const canClosePurchaseRequest = requireRole(
  'OPERADOR_N1',
  'LIDER_N1',
  'DIRETOR_TI',
);
// Listar: todos veem (transparência operacional — evita "já abriram?"
// no Teams entre operadores).
export const canViewPurchaseRequests = requireRole(
  'OPERADOR_N1',
  'LIDER_N1',
  'DIRETOR_TI',
);
