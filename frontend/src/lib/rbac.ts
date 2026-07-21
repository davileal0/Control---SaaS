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

export interface NavItem {
  key: string;
  label: string;
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', roles: ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'] },
  { key: 'assets', label: 'Ativos', roles: ['OPERADOR_N1', 'LIDER_N1'] },
  { key: 'audit', label: 'Auditoria', roles: ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'] },
  { key: 'discarded', label: 'Descartados', roles: ['LIDER_N1', 'DIRETOR_TI'] },
  // Painel de atividade dos operadores — apoio a feedback individual.
  // Gerencial: Líder e Coordenador (mesma faixa dos relatórios de leitura).
  { key: 'activity', label: 'Atividade', roles: ['LIDER_N1', 'DIRETOR_TI'] },
   // Importação de inventário: operador sobe planilha, gestor aprova.
  { key: 'inventory', label: 'Inventário', roles: ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'] },
  // Visível pra TODOS — transparência operacional. Evita o "já abriram SC?"
  // no Teams: o operador N1 vê o status mesmo sem poder autorizar.
  { key: 'purchase-requests', label: 'Solicitações', roles: ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'] },
  { key: 'reports', label: 'Relatórios', roles: ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'] },
  // Configurações (inclui gestão de acessos) — Líder e Coordenador.
  { key: 'settings', label: 'Configurações', roles: ['LIDER_N1', 'DIRETOR_TI'] },
];

export function visibleNav(role: Role): NavItem[] {
  return NAV_ITEMS.filter((i) => i.roles.includes(role));
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
