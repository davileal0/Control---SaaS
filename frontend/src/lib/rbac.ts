import { Role } from '../types/domain';

// Espelha o RBAC do back-end: o front apenas ESCONDE o que o usuário não
// pode fazer (UX). A autorização real é sempre reimposta na API.

export function canWrite(role: Role): boolean {
  return role === 'OPERADOR_N1' || role === 'LIDER_N1';
}

export function canSeeStockReport(role: Role): boolean {
  return role === 'LIDER_N1' || role === 'DIRETOR_TI';
}

// Gerenciamento de usuários (cadastrar, mudar papel, desativar) é
// responsabilidade administrativa do Líder e do Coordenador de TI.
// Auditoria exige separação de responsabilidades: quem concede acesso
// não é (só) o desenvolvedor. Toda ação fica registrada em trilha imutável.
export function canManageUsers(role: Role): boolean {
  return role === 'LIDER_N1' || role === 'DIRETOR_TI';
}

// Grupos da navegação. Dão contexto e hierarquia à barra lateral, no
// lugar de uma lista plana. A ordem aqui é a ordem de exibição.
export type NavGroupId = 'overview' | 'operation' | 'analysis' | 'system';

export interface NavGroup {
  id: NavGroupId;
  label: string;
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'operation', label: 'Operação' },
  { id: 'analysis', label: 'Análise' },
  { id: 'system', label: 'Sistema' },
];

export interface NavItem {
  key: string;
  label: string;
  roles: Role[];
  group: NavGroupId;
  // Frase curta usada como tooltip: contextualiza o que a página faz.
  hint: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'overview', hint: 'Visão geral e indicadores do parque de ativos', roles: ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'] },
  { key: 'assets', label: 'Ativos', group: 'operation', hint: 'Cadastrar, movimentar e descartar equipamentos', roles: ['OPERADOR_N1', 'LIDER_N1'] },
  // Importação de inventário: operador sobe planilha, gestor aprova.
  { key: 'inventory', label: 'Inventário', group: 'operation', hint: 'Importar planilha do inventário oficial de TI', roles: ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'] },
  // Visível pra TODOS — transparência operacional. Evita o "já abriram SC?"
  // no Teams: o operador N1 vê o status mesmo sem poder autorizar.
  { key: 'purchase-requests', label: 'Solicitações', group: 'operation', hint: 'Solicitações de compra e seu andamento', roles: ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'] },
  { key: 'movimentacoes', label: 'Movimentações', group: 'operation', hint: 'Atribuições de ativos a chamados e pendências de periférico', roles: ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'] },
  { key: 'audit', label: 'Auditoria', group: 'analysis', hint: 'Trilha de movimentações e correções por ativo', roles: ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'] },
  // Painel de atividade dos operadores — apoio a feedback individual.
  // Gerencial: Líder e Coordenador (mesma faixa dos relatórios de leitura).
  { key: 'activity', label: 'Atividade', group: 'analysis', hint: 'Painel de atividade dos operadores', roles: ['LIDER_N1', 'DIRETOR_TI'] },
  { key: 'discarded', label: 'Descartados', group: 'analysis', hint: 'Equipamentos descartados e seus registros', roles: ['LIDER_N1', 'DIRETOR_TI'] },
  { key: 'reports', label: 'Relatórios', group: 'analysis', hint: 'Correções e descartes para exportação', roles: ['LIDER_N1', 'DIRETOR_TI'] },
  // Configurações (inclui gestão de acessos) — Líder e Coordenador.
  { key: 'settings', label: 'Configurações', group: 'system', hint: 'Gestão de acessos e preferências', roles: ['LIDER_N1', 'DIRETOR_TI'] },
];

export function visibleNav(role: Role): NavItem[] {
  return NAV_ITEMS.filter((i) => i.roles.includes(role));
}

// Agrupa os itens visíveis por grupo, preservando a ordem de NAV_GROUPS
// e omitindo grupos que ficaram sem itens para o papel atual.
export function groupedNav(role: Role): { group: NavGroup; items: NavItem[] }[] {
  const visible = visibleNav(role);
  return NAV_GROUPS.map((group) => ({
    group,
    items: visible.filter((i) => i.group === group.id),
  })).filter((g) => g.items.length > 0);
}

// =====================================================================
// Permissões da feature de Solicitações de Compra (SC)
// =====================================================================
// Reflete a hierarquia operacional definida no alinhamento:
//   - Autorizar: Líder/Coordenador (decisão executiva — Coordenador
//     cobre ausência do Líder: férias, licença)
//   - Abrir (registrar nº SC): Operador (Heryck) + Líder (operação)
//   - Fechar (manual): Operador (Heryck — recebimento) + Líder (operação)
//   - Cancelar: Líder/Coordenador (correção hierárquica de aval)
// Coordenador (DIRETOR_TI) DECIDE (autoriza/cancela) mas não OPERA
// (não abre/fecha) — fechar cria ativos, e isso é operação.

export function canAuthorizePurchaseRequest(role: Role): boolean {
  return role === 'LIDER_N1' || role === 'DIRETOR_TI';
}

export function canOpenPurchaseRequest(role: Role): boolean {
  return role === 'OPERADOR_N1' || role === 'LIDER_N1';
}

export function canClosePurchaseRequest(role: Role): boolean {
  return role === 'OPERADOR_N1' || role === 'LIDER_N1';
}

export function canCancelPurchaseRequest(role: Role): boolean {
  return role === 'LIDER_N1' || role === 'DIRETOR_TI';
}
