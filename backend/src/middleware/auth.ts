import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Role } from '../domain/types';

// =====================================================================
// Autenticação
// =====================================================================
// Em produção: NÃO implementamos auth própria. O token (Bearer JWT) é
// emitido pelo SSO/IdP corporativo. Aqui apenas VERIFICAMOS a assinatura
// e extraímos identidade + papel.
//
// Em desenvolvimento (DEV_NO_AUTH=true): pula a verificação de JWT e
// extrai a identidade do header x-dev-role enviado pelo frontend. Útil
// pra testes locais antes da integração com SSO. Bloqueado em produção
// pelo guardrail em config/env.ts.
//
// Recomendação de produção: trocar a verificação por segredo simétrico
// (HS256) por validação via JWKS do provedor (Azure AD / Okta / Keycloak)
// com `jwks-rsa`, e checar issuer/audience.

const VALID_ROLES: Role[] = ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'];

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

// Augmenta o Request do Express com o usuário autenticado.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function isValidRole(value: string): value is Role {
  return (VALID_ROLES as string[]).includes(value);
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  // === Caminho de DESENVOLVIMENTO ===
  // Não exige JWT; lê papel do header x-dev-role. Default: OPERADOR_N1.
  if (env.devNoAuth) {
    const rawRole = (req.headers['x-dev-role'] as string | undefined)?.trim();
    const role = rawRole && isValidRole(rawRole) ? rawRole : 'OPERADOR_N1';

    req.user = {
      id: `dev-${role}`,
      email: `${role.toLowerCase()}@dev.local`,
      name: `Dev ${role}`,
      role,
    };
    return next();
  }

  // === Caminho de PRODUÇÃO (JWT real) ===
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acesso ausente.' });
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

    const role = payload.role as Role;
    if (!payload.sub || !VALID_ROLES.includes(role)) {
      return res.status(401).json({ error: 'Token inválido.' });
    }

    req.user = {
      id: String(payload.sub),
      email: String(payload.email ?? ''),
      name: String(payload.name ?? payload.email ?? ''),
      role,
    };
    return next();
  } catch {
    // Não vazamos o motivo exato (expirado vs. assinatura inválida).
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}
