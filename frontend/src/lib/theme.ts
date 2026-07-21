// =====================================================================
// Tema (dark/light)
// =====================================================================
// Centraliza a lógica de detecção e persistência da preferência de
// tema do usuário.
//
// Por que localStorage (e não sessionStorage)?
//   Tema é PREFERÊNCIA do usuário — faz sentido durar entre sessões.
//   Compare com a sessão de auth (sessionStorage): aquela vale só
//   enquanto a aba estiver aberta; esta vale pra sempre.
//
// Detecção inicial em 3 níveis (do mais específico ao mais genérico):
//   1. localStorage (preferência salva)
//   2. prefers-color-scheme do sistema operacional
//   3. Default 'dark' (estética principal da plataforma)
// =====================================================================

import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'control-theme';

/** Lê a preferência salva, se válida. */
function readStored(): Theme | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'dark' || saved === 'light' ? saved : null;
}

/** Lê a preferência do sistema operacional, se disponível. */
function readSystem(): Theme | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

/** Detecta o tema inicial considerando os 3 níveis de preferência. */
export function detectInitialTheme(): Theme {
  return readStored() ?? readSystem() ?? 'dark';
}

/**
 * Hook React que gerencia o tema. Retorna o tema atual e uma função
 * pra alternar. A preferência é persistida automaticamente, e o atributo
 * data-theme é aplicado no <html> — afetando TODA a plataforma via CSS
 * (qualquer regra `[data-theme='light'] ...` no tokens.css se ativa).
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(detectInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggle() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  return { theme, toggle };
}
