import './asset-location.css';

interface Props {
  unit?: { id: string; name: string } | null;
}

/** Ícone de pino de localização (linha fina, herda currentColor). */
function PinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// Badge de localização (unidade) do ativo, pra fixar no topo dos modais.
// Quando não há unidade definida, mostra estado neutro "sem unidade".
export default function AssetLocation({ unit }: Props) {
  return (
    <span
      className={`asset-location ${unit ? '' : 'asset-location--none'}`}
      title="Localização atual do ativo"
    >
      <PinIcon />
      {unit ? unit.name : 'Sem unidade definida'}
    </span>
  );
}
