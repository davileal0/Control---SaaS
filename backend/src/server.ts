import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

app.listen(env.port, () => {
  // Modo de autenticação decidido no boot (o valor de DEV_NO_AUTH é
  // congelado quando o processo sobe). Deixa explícito no terminal em
  // qual modo o backend está rodando — evita a dúvida "por que só conta
  // logado por SSO?" quando o DEV_NO_AUTH não pegou (ex.: sem restart).
  const authMode = env.devNoAuth
    ? 'DEV_NO_AUTH (sem SSO — usuário dev via x-dev-role)'
    : env.azure
      ? 'SSO (Azure AD / OIDC)'
      : 'SSO (JWT Bearer — Azure não configurado)';

  // eslint-disable-next-line no-console
  console.log(`[control] API ouvindo em http://localhost:${env.port}`);
  // eslint-disable-next-line no-console
  console.log(`[control] env: ${env.nodeEnv} · auth: ${authMode}`);
});
