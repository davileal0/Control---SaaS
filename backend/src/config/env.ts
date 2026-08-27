import 'dotenv/config';

/**
 * Configuração validada na inicialização. Falha fechada (encerra o
 * processo) se uma variável obrigatória estiver ausente — nunca assume
 * defaults inseguros para segredos.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const devNoAuth = process.env.DEV_NO_AUTH === 'true';

// Config do SSO via OIDC (Azure AD / Microsoft Entra ID). Opcional em
// desenvolvimento (dá pra rodar com DEV_NO_AUTH sem configurar o Azure),
// mas se QUALQUER uma das vars estiver presente, tratamos o SSO como
// "pretendido" e validamos o conjunto — evita configuração pela metade.
const azureVars = {
  tenantId: process.env.AZURE_TENANT_ID,
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  redirectUri: process.env.AZURE_REDIRECT_URI,
};
const anyAzure = Object.values(azureVars).some((v) => v && v.trim() !== '');
const allAzure = Object.values(azureVars).every((v) => v && v.trim() !== '');
if (anyAzure && !allAzure) {
  throw new Error(
    'Config do Azure OIDC incompleta. Defina TODAS: AZURE_TENANT_ID, ' +
      'AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_REDIRECT_URI (ou nenhuma).',
  );
}

// GUARDRAIL DE SEGURANÇA: a flag DEV_NO_AUTH JAMAIS pode estar ligada em
// produção. Se isso acontecer, o processo recusa-se a iniciar. Isso
// previne o cenário catastrófico onde alguém esqueceria a flag no .env
// do servidor de produção.
if (nodeEnv === 'production' && devNoAuth) {
  throw new Error(
    'FATAL: DEV_NO_AUTH=true em NODE_ENV=production. ' +
    'Essa flag é exclusiva para desenvolvimento local. Remova do .env de produção.',
  );
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  // Segredo de verificação do token emitido pelo SSO/IdP corporativo.
  // Em produção, prefira validação por JWKS do provedor (ver auth.ts).
  jwtSecret: required('AUTH_JWT_SECRET'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  // Modo de desenvolvimento sem JWT — usa o header x-dev-role como identidade.
  // Bloqueado em produção pelo guardrail acima.
  devNoAuth,
  // URL do frontend — pra onde o backend redireciona após o login SSO.
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  // SSO OIDC (Azure AD). null se não configurado (roda só com DEV_NO_AUTH).
  azure: allAzure
    ? {
        tenantId: azureVars.tenantId as string,
        clientId: azureVars.clientId as string,
        clientSecret: azureVars.clientSecret as string,
        redirectUri: azureVars.redirectUri as string,
        // Endpoint de descoberta do Azure (a lib lê tudo daqui)
        issuer: `https://login.microsoftonline.com/${azureVars.tenantId}/v2.0`,
      }
    : null,

  // Integração com o Acelerato (gestão de chamados). Opcional — se as 3
  // variáveis não estiverem definidas, a integração fica desligada e o
  // resto do sistema roda normalmente. Basic Auth: e-mail + token.
  // O TOKEN é segredo — vive só aqui (lido do .env), nunca no código/front.
  acelerato:
    process.env.ACELERATO_BASE_URL &&
    process.env.ACELERATO_EMAIL &&
    process.env.ACELERATO_TOKEN
      ? {
          baseUrl: process.env.ACELERATO_BASE_URL.replace(/\/$/, ''),
          email: process.env.ACELERATO_EMAIL,
          token: process.env.ACELERATO_TOKEN,
          // Caminho do endpoint de chamado; {id} = número do chamado
          // (chamadoKey). Confirmado na doc: GET /api/publica/v2/chamados/{chamadoKey}.
          ticketPath:
            process.env.ACELERATO_TICKET_PATH ?? '/api/publica/v2/chamados/{id}',
        }
      : null,
};

export const isProd = env.nodeEnv === 'production';
