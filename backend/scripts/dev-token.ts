/**
 * Utilitário SOMENTE para desenvolvimento: emite um JWT local para
 * testar a API sem o SSO. Em produção, os tokens vêm do IdP corporativo.
 *
 * Uso: npm run token -- diretor@empresa.com DIRETOR_TI
 */
import jwt from 'jsonwebtoken';
import { env, isProd } from '../src/config/env';

if (isProd) {
  // eslint-disable-next-line no-console
  console.error('Recusado: não emita tokens locais em produção.');
  process.exit(1);
}

const [, , email = 'operador@empresa.com', role = 'OPERADOR_N1'] = process.argv;

const token = jwt.sign(
  { sub: `dev-${role}`, email, role },
  env.jwtSecret,
  { algorithm: 'HS256', expiresIn: '8h' },
);

// eslint-disable-next-line no-console
console.log(token);
