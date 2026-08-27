import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import api from './routes';

export function createApp() {
  const app = express();

  // Cabeçalhos de segurança (CSP, HSTS, no-sniff, etc.).
  app.use(helmet());

  // CORS restrito à origem do front-end (allowlist).
  // x-dev-role: header de identidade do modo DEV_NO_AUTH (ver auth.ts).
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'x-dev-role'],
    }),
  );

  app.use(express.json({ limit: '100kb' }));

  // Cookies assinados — usados pela transação de login OIDC (state/PKCE).
  app.use(cookieParser(env.jwtSecret));

  // Rate limiting básico contra abuso/força bruta.
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Rotas de autenticação SSO — NÃO passam pelo `authenticate` (o login
  // não pode exigir estar logado). Ficam antes da API protegida.
  app.use('/auth', authRoutes);

  // Toda a API exige autenticação; cada rota aplica seu RBAC.
  app.use('/api', authenticate, api);

  app.use(errorHandler);
  return app;
}
