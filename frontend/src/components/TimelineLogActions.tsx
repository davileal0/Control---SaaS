import { MovementLog } from '../types/domain';

interface Props {
  log: MovementLog;
  /** Se o usuário tem permissão de escrita (Operador N1 ou Líder N1) */
  canWrite: boolean;
  onEdit: () => void;
  onVoid: () => void;
}

// Logs de descarte têm originStatus === destinationStatus (assinatura
// do `discardAsset` no backend, que registra a transição estática só
// pra dar contexto). Anular um log de descarte é confuso porque o
// `is_archived = true` no asset não se desfaz — então escondemos o
// botão "Anular" nesses casos. Editar continua disponível (pra
// corrigir typos no motivo).
function isDiscardLog(log: MovementLog) {
  return log.originStatus === log.destinationStatus;
}

// Barra de ações por entrada da timeline. Discreta: botões de texto
// sem fundo, alinhados à direita, em cor muted. Hover destaca em
// branco. Some quando o usuário não tem write OR o log já está
// anulado (não pode editar nem anular novamente).
export default function TimelineLogActions({
  log,
  canWrite,
  onEdit,
  onVoid,
}: Props) {
  if (!canWrite || log.isVoided) return null;

  return (
    <div className="log-actions">
      <button type="button" className="log-action" onClick={onEdit}>
        Editar
      </button>
      {!isDiscardLog(log) && (
        <button type="button" className="log-action" onClick={onVoid}>
          Anular
        </button>
      )}
    </div>
  );
}
