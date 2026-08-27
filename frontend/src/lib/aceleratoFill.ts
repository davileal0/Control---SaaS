import { AceleratoTicket } from './api';
import { Unit } from '../types/domain';

// =====================================================================
// Extração/normalização de dados do chamado do Acelerato para preencher
// os campos das movimentações da Control.
// =====================================================================

/** Remove acentos e sobe pra maiúsculas (pra comparar nomes de campo). */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** Deriva um nome legível a partir do e-mail corporativo.
 *  davi.pinheiro@redeunifique.com.br → "Davi Pinheiro". */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

/** Acha o valor de um campo personalizado cujo nome casa com o predicado. */
export function findCampo(
  ticket: AceleratoTicket,
  pred: (nomeNormalizado: string) => boolean,
): string | null {
  const campo = ticket.camposPersonalizados.find(
    (c) => c.valor != null && c.valor.trim() !== '' && pred(norm(c.nome)),
  );
  return campo?.valor?.trim() ?? null;
}

// Extratores específicos (por palavra-chave, tolerante a pontuação/espaços):
export function extrairColaboradorEmail(t: AceleratoTicket): string | null {
  return findCampo(
    t,
    (n) => n.includes('MAIL') && (n.includes('USUARIO') || n.includes('COLABORADOR')),
  );
}
export function extrairLiderEmail(t: AceleratoTicket): string | null {
  return findCampo(t, (n) => n.includes('MAIL') && n.includes('LIDER'));
}
export function extrairSetor(t: AceleratoTicket): string | null {
  return findCampo(t, (n) => n.includes('SETOR'));
}
export function extrairUnidadeTexto(t: AceleratoTicket): string | null {
  return findCampo(t, (n) => n.includes('UNIDADE'));
}

/** True se a categoria do chamado é de "Novo Equipamento". */
export function isNovoEquipamento(t: AceleratoTicket): boolean {
  return norm(t.categoria ?? '').includes('NOVO EQUIPAMENTO');
}

// Palavras genéricas que não ajudam a identificar a unidade.
const UNIT_STOPWORDS = new Set([
  'CD',
  'UNIDADE',
  'DE',
  'DO',
  'DA',
  'LOJA',
  'FILIAL',
  'MATRIZ',
  'UNIFIQUE',
]);

// True se o valor do campo indica que o item FOI solicitado (não "Não").
function isRequested(valor: string | null): boolean {
  if (!valor) return false;
  const v = norm(valor).trim();
  return v !== '' && v !== 'NAO' && v !== '-' && v !== 'N/A' && v !== '0';
}

// Mapeia o nome do campo de periférico do chamado → tipo canônico da
// Control (PERIPHERAL_TYPES). Ordem importa: específicos antes de genéricos.
const PERIPH_RULES: { match: (n: string) => boolean; type: string }[] = [
  { match: (n) => n.includes('HEADSET'), type: 'Headset' },
  { match: (n) => n.includes('MOCHILA'), type: 'Mochila' },
  { match: (n) => n.includes('MOUSE') && n.includes('PAD'), type: 'Mousepad' },
  { match: (n) => n.includes('SUPORTE') && n.includes('NOTEBOOK'), type: 'Suporte p/ notebook' },
  { match: (n) => n.includes('SUPORTE') && n.includes('VIDRO'), type: 'Suporte de vidro monitor' },
  { match: (n) => n.includes('SUPORTE') && n.includes('ARTICULAD'), type: 'Suporte Monitor Articulado' },
  { match: (n) => n.includes('TECLADO'), type: 'Teclado' },
  { match: (n) => n.includes('WEBCAM') || n.includes('WEB CAM'), type: 'WebCam' },
  { match: (n) => n.includes('MONITOR') && n.includes('EXTRA'), type: 'Monitor Extra' },
  { match: (n) => n.includes('MONITOR') && !n.includes('SUPORTE'), type: 'Monitor' },
  { match: (n) => n.includes('REGUA') || n.includes('FILTRO DE LINHA'), type: 'Régua de energia' },
  // Mouse por último (evita casar "Mouse pad" como Mouse).
  { match: (n) => n.includes('MOUSE'), type: 'Mouse' },
];

/**
 * Extrai os tipos de periférico SOLICITADOS no chamado (os campos "Sim").
 * Ignora o campo "Equipamento" (é o ativo rastreável, não periférico) e
 * itens que não existem no catálogo da Control.
 */
export function extrairPerifericosSolicitados(t: AceleratoTicket): string[] {
  const out = new Set<string>();
  for (const campo of t.camposPersonalizados) {
    if (!isRequested(campo.valor)) continue;
    const n = norm(campo.nome);
    for (const rule of PERIPH_RULES) {
      if (rule.match(n)) {
        out.add(rule.type);
        break;
      }
    }
  }
  return [...out];
}

/**
 * Casa o texto de unidade do chamado (ex: "010054-UNIFIQUE - TAQUARI/SC")
 * com uma unidade da Control (ex: "CD - Taquari") por token significativo.
 * Retorna a unidade se exatamente uma casar; 'ambiguous' se mais de uma;
 * null se nenhuma.
 */
export function matchUnit(
  unitText: string,
  units: Unit[],
): Unit | 'ambiguous' | null {
  const target = norm(unitText);
  const matches = units.filter((u) => {
    const tokens = norm(u.name)
      .split(/[^A-Z0-9]+/)
      .filter((t) => t.length >= 3 && !UNIT_STOPWORDS.has(t));
    return tokens.some((tok) => target.includes(tok));
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return 'ambiguous';
  return null;
}
