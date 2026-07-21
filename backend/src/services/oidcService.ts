import * as client from 'openid-client';
import { env } from '../config/env';

// =====================================================================
// Serviço OIDC (Azure AD / Microsoft Entra ID)
// =====================================================================
// Encapsula a biblioteca openid-client (v6) — a API v6 usa funções
// soltas (discovery, buildAuthorizationUrl, authorizationCodeGrant),
// não o modelo antigo de Issuer/Client.
//
// Fluxo (Authorization Code + PKCE):
//   1. buildLoginUrl() → monta a URL do Azure pra onde redirecionar
//   2. usuário autentica no Azure
//   3. Azure volta pro /auth/callback com um `code`
//   4. handleCallback() troca o code por tokens e valida o ID token
//
// A descoberta (discovery) é feita uma vez e cacheada — ela lê o
// .well-known/openid-configuration do Azure (endpoints, chaves, etc.).

let configPromise: Promise<client.Configuration> | null = null;

/** Retorna a Configuration do openid-client (cacheada). */
async function getConfig(): Promise<client.Configuration> {
  if (!env.azure) {
    throw new Error('SSO OIDC não configurado (env.azure ausente).');
  }
  if (!configPromise) {
    configPromise = client.discovery(
      new URL(env.azure.issuer),
      env.azure.clientId,
      env.azure.clientSecret,
    );
  }
  return configPromise;
}

/** Dados temporários guardados entre /auth/login e /auth/callback.
 *  state + PKCE verifier + nonce protegem o fluxo (CSRF e replay). */
export interface LoginTransaction {
  state: string;
  codeVerifier: string;
  nonce: string;
}

/** Passo 1: monta a URL de autorização do Azure e a transação a guardar. */
export async function buildLoginUrl(): Promise<{
  url: string;
  tx: LoginTransaction;
}> {
  const config = await getConfig();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: env.azure!.redirectUri,
    scope: 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return { url: url.href, tx: { state, codeVerifier, nonce } };
}

/** Identidade extraída do ID token do Azure. */
export interface OidcIdentity {
  email: string;
  name: string;
  subject: string; // 'sub' do Azure (id único e estável do usuário)
}

/** Passo 4: troca o code por tokens, valida, e devolve a identidade. */
export async function handleCallback(
  currentUrl: string,
  tx: LoginTransaction,
): Promise<OidcIdentity> {
  const config = await getConfig();

  const tokens = await client.authorizationCodeGrant(
    config,
    new URL(currentUrl),
    {
      pkceCodeVerifier: tx.codeVerifier,
      expectedState: tx.state,
      expectedNonce: tx.nonce,
    },
  );

  const claims = tokens.claims();
  if (!claims) {
    throw new Error('ID token sem claims.');
  }

  // Azure manda o email em 'email' ou, às vezes, em 'preferred_username'.
  const email =
    (claims.email as string | undefined) ??
    (claims.preferred_username as string | undefined) ??
    '';
  const name = (claims.name as string | undefined) ?? email;

  return {
    email: email.toLowerCase().trim(),
    name,
    subject: String(claims.sub),
  };
}

/** URL de logout do Azure (encerra a sessão no IdP também). */
export async function buildLogoutUrl(
  postLogoutRedirect: string,
): Promise<string> {
  const config = await getConfig();
  const url = client.buildEndSessionUrl(config, {
    post_logout_redirect_uri: postLogoutRedirect,
  });
  return url.href;
}
