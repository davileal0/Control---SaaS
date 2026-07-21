/**
 * Sistema de notificações (toasts) da plataforma.
 *
 * Arquitetura:
 *  - ToastProvider envolve o app inteiro (App.tsx) → contexto global
 *  - useToast() hook nos componentes → API ergonômica pra disparar
 *  - ToastViewport (sub-componente) → renderiza a stack no canto inferior direito
 *
 * Padrão MacOS/Notion/Linear:
 *  - Posição: bottom-right (não compete com header, leitura natural)
 *  - Auto-dismiss: 4s (sucesso/info) ou 5.5s (erro — tempo extra pra ler)
 *  - Click on toast: dismiss imediato
 *  - Stack vertical, novos toasts empilham EM CIMA dos antigos
 *
 * Variantes:
 *  - success: ação concluiu ("Ativo cadastrado")
 *  - error: ação falhou ("Não foi possível salvar")
 *  - info: contexto neutro ("Carregando dados")
 *
 * Undo (preparado pra próxima iteração):
 *  - Campo opcional onUndo no toast → renderiza botão "Desfazer"
 *  - Esta iteração: API pronta mas wiring de undo backend fica pra próxima
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import Toast from '../components/Toast';
import '../components/toast.css';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
  onUndo?: () => void;
}

interface ToastContextValue {
  toasts: ToastItem[];
  show: (toast: Omit<ToastItem, 'id'>) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Gera ID único — usa crypto.randomUUID quando disponível, fallback pra
// Math.random em ambientes antigos
function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = makeId();
    setToasts((prev) => [...prev, { ...t, id }]);
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, show, dismiss }}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

/**
 * Viewport que renderiza a stack de toasts. Fica fora do shell da app
 * (position: fixed) — não afeta layout dos containers nem é afetada por
 * overflow:hidden de páginas.
 */
function ToastViewport() {
  const ctx = useContext(ToastContext);
  if (!ctx) return null;

  return (
    <div
      className="toast-viewport"
      // role="region" + aria-live torna o conjunto anunciável por
      // leitores de tela quando um novo toast é adicionado
      role="region"
      aria-live="polite"
      aria-label="Notificações"
    >
      {ctx.toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={() => ctx.dismiss(t.id)} />
      ))}
    </div>
  );
}

/**
 * Hook que componentes usam pra disparar toasts.
 *
 * Uso:
 *   const toast = useToast();
 *   toast.success('Ativo cadastrado');
 *   toast.error('Falha ao salvar');
 *   toast.info('Carregando...');
 *
 * Pra controle fino (duração, undo):
 *   toast.show({ variant: 'success', message: '...', duration: 6000, onUndo: ... });
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() precisa ser usado dentro de <ToastProvider>');
  }

  return {
    success: (message: string, opts?: { duration?: number; onUndo?: () => void }) =>
      ctx.show({
        variant: 'success',
        message,
        duration: opts?.duration ?? 4000,
        onUndo: opts?.onUndo,
      }),
    error: (message: string, opts?: { duration?: number }) =>
      ctx.show({
        variant: 'error',
        message,
        duration: opts?.duration ?? 5500, // erro tem tempo extra pra ler
      }),
    info: (message: string, opts?: { duration?: number }) =>
      ctx.show({
        variant: 'info',
        message,
        duration: opts?.duration ?? 4000,
      }),
    show: ctx.show,
    dismiss: ctx.dismiss,
  };
}

/**
 * Tipo do hook useToast — útil pra componentes que recebem o toast
 * como prop ou criam wrappers
 */
export type ToastApi = ReturnType<typeof useToast>;
