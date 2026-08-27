import { AssetStatus } from './types';

// =====================================================================
// Máquina de estados do ciclo de vida do ativo
// =====================================================================
//
//  [Ingestão] ──> Disponível ⇄ Em Uso
//                     │            │
//                     └──────┬─────┘
//                            ▼
//                       Danificado ──> (reparado) ──> Disponível
//                            │
//                            ▼
//                     is_archived = true  (Descartar — ortogonal ao status)
//
// Transições documentadas na especificação:
//  - Ingestão -> Disponível          (cadastro de novo ativo)
//  - Disponível -> Em Uso            (Fluxo A; Fluxo B saída; Fluxo C reuso)
//  - Em Uso -> Disponível            (Fluxo B retorno aprovado; Fluxo C presencial)
//  - Em Uso -> Danificado            (Fluxo B: reprovado nos testes -> Spectra)
//  - Disponível -> Danificado        (item de estoque encontrado com falha)
//
// Premissa assumida (não explícita, mas implícita no envio à Spectra):
//  - Danificado -> Disponível        (equipamento reparado retorna ao estoque)
//    Caso a regra de negócio rejeite reaproveitamento pós-reparo, basta
//    remover este par do mapa abaixo.
//
// O DESCARTE não é uma transição de status: é a flag is_archived. Pode ser
// acionado a partir de qualquer status ativo (Spectra condena OU TI decide),
// exige justificativa em texto e remove o ativo das métricas/listagens.

const ALLOWED_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  Disponivel: ['EmUso', 'Danificado'],
  EmUso: ['Disponivel', 'Danificado'],
  Danificado: ['Disponivel'],
};

export interface TransitionContext {
  ticketId?: string | null;
  endUserName?: string | null;
  managerName?: string | null;
  department?: string | null;
}

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransitionError';
  }
}

/** Indica se a mudança de `from` para `to` é permitida pelo ciclo de vida. */
export function canTransition(from: AssetStatus, to: AssetStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Valida uma transição e seus campos obrigatórios.
 * Lança TransitionError com mensagem voltada ao operador.
 */
export function assertTransition(
  from: AssetStatus,
  to: AssetStatus,
  ctx: TransitionContext,
): void {
  if (!canTransition(from, to)) {
    throw new TransitionError(
      `Transição inválida: "${from}" não pode ir para "${to}".`,
    );
  }

  // Fluxo A — Aumento de quadro: atribuir ao colaborador exige rastreio
  // de quem recebeu, o líder, o setor e o chamado de origem.
  if (to === 'EmUso') {
    const missing: string[] = [];
    if (!ctx.ticketId) missing.push('ticket_id');
    if (!ctx.endUserName) missing.push('end_user_name');
    if (!ctx.managerName) missing.push('manager_name');
    if (!ctx.department) missing.push('department');
    if (missing.length) {
      throw new TransitionError(
        `Para colocar o ativo Em Uso, preencha: ${missing.join(', ')}.`,
      );
    }
  }
}
