import { Unit } from '../types/domain';

interface Props {
  units: Unit[];
  value: string;
  onChange: (unitId: string) => void;
  /** Rótulo do campo (default: "Unidade de destino"). */
  label?: string;
}

// Campo de seleção de unidade (localização) usado nos modais de
// movimentação. Vem pré-preenchido com a unidade atual do ativo; o
// usuário só troca se a máquina mudou de unidade. Se não há unidades
// cadastradas, mostra uma dica em vez do select.
export default function UnitSelectField({
  units,
  value,
  onChange,
  label = 'Unidade de destino',
}: Props) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      {units.length === 0 ? (
        <span className="form-hint">
          Nenhuma unidade cadastrada. Crie em Configurações → Unidades.
        </span>
      ) : (
        <select
          className="field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Sem unidade</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}
