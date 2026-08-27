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
