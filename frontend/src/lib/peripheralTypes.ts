/**
 * Tipos canônicos de periférico (kit de atribuição).
 *
 * Periféricos são contados por tipo, e o "tipo" é o próprio `model` do
 * ativo (a criação em massa grava o tipo em `model`). Esta lista é a
 * fonte de verdade dos itens que podem ser entregues junto de um ativo
 * rastreável. Espelha backend/src/services/peripheralTypes.ts.
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
