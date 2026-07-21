// =====================================================================
// Preferência de glassmorphism (intensidade do "vidro")
// =====================================================================
// Espelha a arquitetura de lib/theme.ts: um hook que persiste a
// preferência em localStorage e aplica um atributo no <html>, deixando
// o CSS (tokens.css) reagir via seletor [data-glass='...'].
//
// 3 níveis (presets discretos, não slider — mais simples e suficiente):
//   solido — sem transparência nem blur (cards opacos)
//   medio  — meio-termo (transparência e blur reduzidos)
//   vidro  — o glassmorphism cheio (estética padrão da plataforma)
//
// Por que presets e não slider contínuo?
//   Slider exige normalizar N variáveis num multiplicador e re-render
//   contínuo. 3 níveis cobrem a real necessidade (quem não curte glass
//   escolhe "sólido"; quem ama deixa "vidro") com muito menos código.
//
// Por que localStorage? É PREFERÊNCIA do usuário — dura entre sessões,
// igual ao tema.
// =====================================================================

import { useEffect, useState } from 'react';

export type GlassLevel = 'solido' | 'medio' | 'vidro';

export const GLASS_LEVELS: { value: GlassLevel; label: string }[] = [
  { value: 'solido', label: 'Sólido' },
  { value: 'medio', label: 'Médio' },
  { value: 'vidro', label: 'Vidro' },
];

const STORAGE_KEY = 'control-glass';

/** Lê a preferência salva, se válida. */
function readStored(): GlassLevel | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'solido' || saved === 'medio' || saved === 'vidro'
    ? saved
    : null;
}

/** Default 'vidro' — é a estética principal da plataforma. */
export function detectInitialGlass(): GlassLevel {
  return readStored() ?? 'vidro';
}

/**
 * Hook que gerencia a intensidade do glass. Aplica data-glass no <html>
 * e persiste. A troca é INSTANTÂNEA (sem transição) — decisão de UX
 * pra sensibilidade vestibular: nada de animar opacidade/blur ao mudar.
 */
export function useGlass() {
  const [glass, setGlass] = useState<GlassLevel>(detectInitialGlass);

  useEffect(() => {
    document.documentElement.setAttribute('data-glass', glass);
    localStorage.setItem(STORAGE_KEY, glass);
  }, [glass]);

  return { glass, setGlass };
}
