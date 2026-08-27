import { env } from '../config/env';

// =====================================================================
// Integração com o Acelerato (gestão de chamados)
// =====================================================================
// Busca dados de um ticket via API REST do Acelerato. Autenticação por
// Basic Auth (e-mail do usuário + token), com as credenciais SEMPRE
// vindas do .env — nunca hard-coded, nunca no frontend.
//
// Cache em memória (TTL curto) porque a doc do Acelerato avisa que o
// acesso pode ser cortado por uso indevido — não convém bater na API a
// cada clique. Se virar gargalo, trocar por Redis.

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map<string, { at: number; data: unknown }>();

/** True se as 3 variáveis do Acelerato estão configuradas no .env. */
export function isAceleratoConfigured(): boolean {
  return env.acelerato !== null;
}

/**
 * Busca um ticket pelo número/identificador no Acelerato. Retorna o JSON
 * cru da API (o mapeamento pros campos que a UI vai exibir é feito depois,
 * quando conhecermos o formato exato da resposta do seu Acelerato).
 */
export async function getAceleratoTicket(ticketId: string): Promise<unknown> {
  const cfg = env.acelerato;
  if (!cfg) {
    throw httpError(
      'Integração com o Acelerato não configurada (defina ACELERATO_BASE_URL, ACELERATO_EMAIL e ACELERATO_TOKEN no .env).',
      503,
    );
  }

  const cached = cache.get(ticketId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const auth = Buffer.from(`${cfg.email}:${cfg.token}`).toString('base64');
  const path = cfg.ticketPath.replace('{id}', encodeURIComponent(ticketId));
  const url = `${cfg.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });
  } catch {
    throw httpError('Falha ao contatar o Acelerato (rede/timeout).', 502);
  }

  if (res.status === 401 || res.status === 403) {
    throw httpError('Acelerato recusou a autenticação (verifique e-mail/token).', 502);
  }
  if (res.status === 404) {
    throw httpError('Chamado não encontrado no Acelerato.', 404);
  }
  if (!res.ok) {
    throw httpError(`Acelerato retornou erro ${res.status}.`, 502);
  }

  const data = await res.json();
  cache.set(ticketId, { at: Date.now(), data });
  return data;
}
