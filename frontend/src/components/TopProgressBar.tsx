import { useEffect, useState } from 'react';
import { subscribeLoading } from '../lib/loadingTracker';

/**
 * Barra fina vermelha LED no topo da plataforma — aparece enquanto
 * qualquer request HTTP está em andamento, some quando todos terminam.
 *
 * Padrão Vercel/Linear/GitHub: feedback contínuo de atividade sem
 * bloquear interação. Animação indeterminada (não sabemos quanto
 * o request vai demorar) — uma linha luminosa percorre da esquerda
 * pra direita em loop.
 *
 * Usa o tracker singleton (lib/loadingTracker.ts) — sem context
 * pra evitar rerender da app inteira a cada request.
 */
export default function TopProgressBar() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    return subscribeLoading((count) => setActive(count > 0));
  }, []);

  return (
    <div
      className={`top-progress${active ? ' top-progress--active' : ''}`}
      aria-hidden
    />
  );
}
