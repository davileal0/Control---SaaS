import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import {
  buildLoginUrl,
  handleCallback,
  buildLogoutUrl,
  LoginTransaction,
} from '../services/oidcService';

// =====================================================================
// Rotas de autenticação SSO (OIDC / Azure AD)
// =====================================================================
// Fluxo:
//   GET /auth/login    → redireciona pro Azure
//   GET /auth/callback → Azure volta aqui; validamos, achamos o User no
//                        banco (Forma A: papel vem da tabela), emitimos
//                        o JWT do Control e devolvemos ao frontend
//   GET /auth/logout   → encerra a sessão (e no Azure)
//
// A "transação de login" (state + PKCE + nonce) vai num cookie httpOnly
// assinado, de vida curta (10 min) — não precisa de store no servidor.

const router = Router();

const TX_COOKIE = 'control_oidc_tx';
const TX_MAX_AGE_MS = 10 * 60 * 1000; // 10 min

// Cookie options seguros. secure=true em produção (exige HTTPS).
function txCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax' as const,
    maxAge: TX_MAX_AGE_MS,
    signed: true,
  };
}

/** Emite o JWT interno do Control (mesmo formato que o middleware valida). */
function issueControlToken(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
}): string {
  return jwt.sign(
    { email: user.email, name: user.fullName, role: user.role },
    env.jwtSecret,
    { algorithm: 'HS256', subject: user.id, expiresIn: '8h' },
  );
}

// --- GET /auth/login: inicia o fluxo, redireciona pro Azure ---
router.get('/login', async (_req: Request, res: Response) => {
  if (!env.azure) {
    return res.status(503).json({ error: 'SSO não configurado.' });
  }
  try {
    const { url, tx } = await buildLoginUrl();
    res.cookie(TX_COOKIE, JSON.stringify(tx), txCookieOptions());
    return res.redirect(url);
  } catch {
    return res.status(500).json({ error: 'Falha ao iniciar login.' });
  }
});

// --- GET /auth/callback: Azure retorna aqui ---
router.get('/callback', async (req: Request, res: Response) => {
  if (!env.azure) {
    return res.status(503).json({ error: 'SSO não configurado.' });
  }

  // Recupera a transação do cookie
  const raw = req.signedCookies?.[TX_COOKIE];
  if (!raw) {
    return res.redirect(
      `${env.frontendUrl}/login?error=sessao_expirada`,
    );
  }
  res.clearCookie(TX_COOKIE);

  let tx: LoginTransaction;
  try {
    tx = JSON.parse(raw);
  } catch {
    return res.redirect(`${env.frontendUrl}/login?error=invalido`);
  }

  try {
    // Monta a URL atual (o Azure anexou ?code=...&state=...)
    const currentUrl = `${env.azure.redirectUri}${
      req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    }`;

    const identity = await handleCallback(currentUrl, tx);

    if (!identity.email) {
      return res.redirect(`${env.frontendUrl}/login?error=sem_email`);
    }

    // FORMA A: o papel vem da tabela User. Busca pelo email.
    const user = await prisma.user.findUnique({
      where: { email: identity.email },
    });

    // Nega acesso se não existe ou está inativo (decisão de segurança).
    if (!user || !user.isActive) {
      return res.redirect(`${env.frontendUrl}/login?error=nao_autorizado`);
    }

    // Emite o JWT do Control e entrega ao frontend.
    const token = issueControlToken(user);
    // Passa o token via fragment (#) — não vai pra logs de servidor nem
    // pro Referer, diferente de query string. O frontend lê e guarda.
    return res.redirect(`${env.frontendUrl}/auth/callback#token=${token}`);
  } catch {
    return res.redirect(`${env.frontendUrl}/login?error=falha_login`);
  }
});

// --- GET /auth/logout: encerra sessão (e no Azure) ---
router.get('/logout', async (_req: Request, res: Response) => {
  if (!env.azure) {
    return res.redirect(env.frontendUrl);
  }
  try {
    const url = await buildLogoutUrl(env.frontendUrl);
    return res.redirect(url);
  } catch {
    return res.redirect(env.frontendUrl);
  }
});

export default router;
