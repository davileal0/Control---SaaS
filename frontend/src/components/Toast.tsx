import { useEffect } from 'react';
import type { ToastItem } from '../contexts/ToastContext';
import { CheckCircleIcon, XCircleIcon, InfoCircleIcon } from './icons';

interface Props {
  toast: ToastItem;
  onDismiss: () => void;
}

/**
 * Toast individual. Responsável por:
 *  - Auto-dismiss via timeout (limpa ao desmontar)
 *  - Renderizar ícone correto pra variante
 *  - Tratar click em "Desfazer" (chama onUndo + dismiss)
 *  - Click no corpo do toast dismiss imediato
 *
 * A apresentação visual (cores, sombra, animação) está em toast.css.
 */
export default function Toast({ toast, onDismiss }: Props) {
  // Auto-dismiss após duração configurada
  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, onDismiss]);

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation(); // não dispara o click no corpo
    toast.onUndo?.();
    onDismiss();
  };

  // Ícone por variante
  let Icon;
  if (toast.variant === 'success') Icon = CheckCircleIcon;
  else if (toast.variant === 'error') Icon = XCircleIcon;
  else Icon = InfoCircleIcon;

  return (
    <div
      className={`toast toast--${toast.variant}`}
      role="status"
      onClick={onDismiss}
    >
      <span className="toast__icon" aria-hidden>
        <Icon size={18} />
      </span>
      <span className="toast__message">{toast.message}</span>
      {toast.onUndo && (
        <button
          type="button"
          className="toast__undo"
          onClick={handleUndo}
          aria-label="Desfazer última ação"
        >
          Desfazer
        </button>
      )}
    </div>
  );
}
