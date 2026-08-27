// Tipos de domínio compartilhados no back-end.
// Os valores espelham os enums do Prisma (identificadores sem acento);
// os rótulos exibidos (Disponível, Em Uso...) são responsabilidade da UI.

export type AssetStatus = 'Disponivel' | 'EmUso' | 'Danificado';

export type Category =
  | 'Notebook'
  | 'Desktop'
  | 'Celular'
  | 'AllInOne'
  | 'Periferico';

export type Role = 'OPERADOR_N1' | 'LIDER_N1' | 'DIRETOR_TI';

/** Estado ativo (não arquivado) considerado nas métricas do dashboard. */
export const ACTIVE_DASHBOARD_STATUSES: AssetStatus[] = ['Disponivel', 'EmUso'];

/** Models válidos para a categoria Periferico (lista direta, sem subcategoria). */
export const PERIPHERAL_MODELS = [
  'Mouse',
  'Teclado',
  'Régua de filtro de linha',
  'Headset',
  'Mousepad',
  'Mochila',
  'Suporte para notebook',
  'Suporte de vidro para monitor',
  'Suporte articulado para monitor',
] as const;
