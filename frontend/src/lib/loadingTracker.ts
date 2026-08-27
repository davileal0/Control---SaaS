/**
 * Tracker global de requests HTTP em andamento.
 *
 * Sem React state nem context — é um event emitter standalone:
 *  - api.ts chama trackRequestStart() antes de fetch e
 *    trackRequestEnd() no finally
 *  - TopProgressBar se inscreve via subscribeLoading() e mostra
 *    a barra fina LED no topo enquanto count > 0
 *
 * Por que não Context: o React rerenderaria a app inteira a cada
 * request iniciado. Um emitter dedicado é mais leve — apenas o
 * TopProgressBar reage ao count change.
 *
 * Por que count e não boolean: vários requests podem rodar em
 * paralelo. A barra só some quando TODOS terminam. Decrementar
 * com Math.max(0, n - 1) protege contra start/end desbalanceados.
 */

type Listener = (count: number) => void;

const listeners = new Set<Listener>();
let count = 0;

function notify() {
  for (const l of listeners) l(count);
}

export function trackRequestStart(): void {
  count += 1;
  notify();
}

export function trackRequestEnd(): void {
  count = Math.max(0, count - 1);
  notify();
}

/**
 * Inscreve um listener. Retorna função de unsubscribe — use em
 * useEffect cleanup:
 *
 *   useEffect(() => subscribeLoading(setActive), []);
 */
export function subscribeLoading(listener: Listener): () => void {
  listeners.add(listener);
  // Dispara imediatamente com o estado atual pro listener
  // não ter que esperar próximo evento.
  listener(count);
  return () => {
    listeners.delete(listener);
  };
}
