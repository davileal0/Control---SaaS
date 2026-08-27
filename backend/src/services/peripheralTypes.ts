/**
 * Tipos canônicos de periférico.
 *
 * Periféricos são commodity: não têm número de série real e são contados
 * por tipo. No modelo de dados, o "tipo" é o próprio campo `model` do
 * Asset (a criação em massa grava `peripheralType` direto em `model`).
 * Por isso esta lista é a fonte de verdade dos tipos entregáveis num kit
 * de atribuição, e cada string aqui casa 1:1 com `Asset.model`.
 *
 * Espelha frontend/src/lib/peripheralTypes.ts (mesma convenção do
 * LOW_STOCK_THRESHOLD; viram um pacote `shared` quando for monorepo).
 */
export const PERIPHERAL_TYPES = [
  'Headset',
  'Mochila',
  'Mousepad',
  'Mouse',
  'Suporte p/ notebook',
  'Suporte de vidro monitor',
  'Teclado',
  'Suporte Monitor Articulado',
  'WebCam',
  'Equipamento',
  'Monitor',
  'Monitor Extra',
  'Régua de energia',
] as const;

export type PeripheralType = (typeof PERIPHERAL_TYPES)[number];
