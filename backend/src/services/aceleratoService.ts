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
const cache = new Map<string, { at: number; data: AceleratoTicketSummary }>();

// Resumo normalizado do chamado (o que a Control exibe). Desacopla a UI
// do JSON gigante do Acelerato.
export interface AceleratoTicketSummary {
  key: number | null;
  titulo: string;
  status: string | null;
  finalizado: boolean;
  solicitante: string | null;
  solicitanteEmail: string | null;
  agente: string | null;
  equipe: string | null;
  categoria: string | null;
  tipo: string | null;
  prioridade: string | null;
  criadoEm: string | null;
  atualizadoEm: string | null;
  arquivado: boolean;
  url: string | null;
  // Campos personalizados do chamado (variam por tipo). Usados na
  // automação de preenchimento (colaborador, setor, líder, unidade).
  camposPersonalizados: { nome: string; valor: string | null }[];
}

// Formato (parcial) do JSON do Acelerato — só os campos que consumimos.
interface RawTicket {
  ticketKey?: number;
  titulo?: string;
  arquivado?: boolean;
  kanbanStatus?: { descricao?: string; fim?: boolean };
  solicitantes?: { nome?: string; email?: string }[];
  reporter?: { nome?: string; email?: string };
  agente?: { nome?: string };
  equipeDeAtendimento?: { nome?: string };
  categoria?: { descricao?: string };
  tipoDeTicket?: { descricao?: string };
  tipoDePrioridade?: { descricao?: string };
  dataDeCriacao?: string;
  dataDaUltimaAlteracao?: string;
  url?: string;
  camposPersonalizadosTicket?: { nomeCampo?: string; valor?: string | null }[];
}

function normalizeTicket(raw: RawTicket): AceleratoTicketSummary {
  const solicitante = raw.solicitantes?.[0] ?? raw.reporter;
  return {
    key: raw.ticketKey ?? null,
    titulo: raw.titulo ?? '',
    status: raw.kanbanStatus?.descricao ?? null,
    finalizado: Boolean(raw.kanbanStatus?.fim),
    solicitante: solicitante?.nome ?? null,
    solicitanteEmail: solicitante?.email ?? null,
    agente: raw.agente?.nome ?? null,
    equipe: raw.equipeDeAtendimento?.nome ?? null,
    categoria: raw.categoria?.descricao ?? null,
    tipo: raw.tipoDeTicket?.descricao ?? null,
    prioridade: raw.tipoDePrioridade?.descricao ?? null,
    criadoEm: raw.dataDeCriacao ?? null,
    atualizadoEm: raw.dataDaUltimaAlteracao ?? null,
    arquivado: Boolean(raw.arquivado),
    url: raw.url ?? null,
    camposPersonalizados: (raw.camposPersonalizadosTicket ?? []).map((c) => ({
      nome: c.nomeCampo ?? '',
      valor: c.valor ?? null,
    })),
  };
}

/** True se as 3 variáveis do Acelerato estão configuradas no .env. */
export function isAceleratoConfigured(): boolean {
  return env.acelerato !== null;
}

/**
 * Busca um ticket pelo número/identificador no Acelerato. Retorna o JSON
 * cru da API (o mapeamento pros campos que a UI vai exibir é feito depois,
 * quando conhecermos o formato exato da resposta do seu Acelerato).
 */
export async function getAceleratoTicket(
  ticketId: string,
): Promise<AceleratoTicketSummary> {
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

  const data = (await res.json()) as RawTicket;
  const summary = normalizeTicket(data);
  cache.set(ticketId, { at: Date.now(), data: summary });
  return summary;
}
