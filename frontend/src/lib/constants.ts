/**
 * Constantes operacionais globais.
 *
 * Quando algo é hardcoded em múltiplos arquivos, vira candidato a
 * morar aqui pra evitar drift (mudou aqui mas esqueceu lá, e a
 * plataforma fica inconsistente).
 */

/**
 * Threshold pra disparar alerta de estoque baixo em periféricos.
 *
 * Calibrado em 25 porque o ciclo de compra Unifique leva 30-40 dias
 * (cotação, aprovação, ordem, logística). Disparar em 25 dá janela
 * pra abrir Solicitação de Compra antes do estoque zerar.
 *
 * No futuro: pode virar configurável por categoria/modelo
 * (mouse tem alto giro → threshold maior; headset premium →
 * menor). Quando isso acontecer, esta constante vira o DEFAULT
 * e cada model pode sobrescrever em uma tabela `peripheral_config`.
 */
export const LOW_STOCK_THRESHOLD = 25;
