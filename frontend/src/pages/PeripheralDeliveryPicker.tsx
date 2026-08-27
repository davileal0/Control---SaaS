import { PERIPHERAL_TYPES } from '../lib/peripheralTypes';
import { PeripheralTypeStock } from '../lib/api';

interface Props {
  /** Estoque disponível por tipo (vindo do backend). */
  stock: PeripheralTypeStock[];
  /** Seleção atual: tipo → quantidade. Ausente = não selecionado. */
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  loading?: boolean;
}

// Painel de seleção de periféricos entregues junto de uma atribuição.
// Lista fixa dos tipos canônicos, cada um com o disponível em estoque.
// Bloqueia entregar mais do que existe: item zerado não pode ser marcado
// e a quantidade é limitada ao disponível (sugere repor quando vazio).
export default function PeripheralDeliveryPicker({
  stock,
  value,
  onChange,
  loading,
}: Props) {
  const availableFor = (type: string) =>
    stock.find((s) => s.type === type)?.available ?? 0;

  function toggle(type: string, available: number) {
    const next = { ...value };
    if (type in next) {
      delete next[type];
    } else {
      next[type] = Math.min(1, available) || 1;
    }
    onChange(next);
  }

  function setQty(type: string, raw: string, available: number) {
    const parsed = Math.floor(Number(raw));
    // Limita ao intervalo [1, disponível] — impossível pedir além do estoque.
    const clamped = Math.max(1, Math.min(available, isNaN(parsed) ? 1 : parsed));
    onChange({ ...value, [type]: clamped });
  }

  if (loading) {
    return <p className="periph-pick__loading">Carregando estoque…</p>;
  }

  return (
    <ul className="periph-pick" aria-label="Periféricos a entregar">
      {PERIPHERAL_TYPES.map((type) => {
        const available = availableFor(type);
        const selected = type in value;
        const qty = value[type] ?? 1;
        const empty = available === 0;
        return (
          <li
            key={type}
            className={`periph-pick__row ${selected ? 'is-selected' : ''} ${
              empty ? 'is-empty' : ''
            }`}
          >
            <label className="periph-pick__check">
              <input
                type="checkbox"
                checked={selected}
                disabled={empty}
                onChange={() => toggle(type, available)}
              />
              <span className="periph-pick__name">{type}</span>
            </label>

            <div className="periph-pick__right">
              {selected && (
                <input
                  type="number"
                  className="periph-pick__qty"
                  min={1}
                  max={available}
                  value={qty}
                  onChange={(e) => setQty(type, e.target.value, available)}
                  aria-label={`Quantidade de ${type}`}
                />
              )}
              {empty ? (
                <span className="periph-pick__repor">sem estoque · repor</span>
              ) : (
                <span className="periph-pick__avail">{available} em estoque</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
