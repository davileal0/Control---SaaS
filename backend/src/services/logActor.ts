import { AuthUser } from '../middleware/auth';
import { Role } from '@prisma/client';

// =====================================================================
// Helper de autoria de logs
// =====================================================================
// Converte o usuário autenticado (req.user) nos campos de autor que o
// MovementLog agora guarda. Centralizado aqui pra todos os serviços
// gravarem o autor da mesma forma.
//
// Os campos são nullable no schema (logs antigos não têm autor), mas
// toda ação NOVA passa por aqui e preenche. Alimenta o Painel de
// Atividade (atividade por operador).

export interface LogActorFields {
  actorUserId: string;
  actorName: string;
  actorRole: Role;
}

/** Extrai os campos de autor a partir do usuário autenticado. */
export function actorFields(user: AuthUser): LogActorFields {
  return {
    actorUserId: user.id,
    actorName: user.name,
    actorRole: user.role,
  };
}
