import { AuditResult } from '../lib/api';
import { STATUS_LABEL, CATEGORY_LABEL } from '../types/domain';
import {
  NotebookIcon,
  MonitorIcon,
  PhoneIcon,
  MouseIcon,
} from '../components/icons';
import './asset-hero.css';

interface Props {
  asset: AuditResult;
  onClose: () => void;
}

// Ícone + chave de cor (accent) por categoria. A chave vira a classe
// asset-hero--<accent>, que define o tom do brilho no CSS.
function categoryVisual(category: string): {
  icon: React.ReactNode;
  accent: string;
} {
  switch (category) {
    case 'Notebook':
      return { icon: <NotebookIcon size={28} />, accent: 'notebook' };
    case 'Celular':
      return { icon: <PhoneIcon size={28} />, accent: 'celular' };
    case 'Desktop':
    case 'AllInOne':
      return { icon: <MonitorIcon size={28} />, accent: 'monitor' };
    case 'Periferico':
      return { icon: <MouseIcon size={28} />, accent: 'periferico' };
    default:
      return { icon: <NotebookIcon size={28} />, accent: 'notebook' };
  }
}

function PinIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// Hero "cockpit" do modal de detalhe do ativo: faixa escura com o ícone
// da categoria em vidro + brilho neon (cor por categoria), título grande,
// SN/IMEI em chips mono, status e localização. Anima ao abrir.
export default function AssetHero({ asset, onClose }: Props) {
  const { icon, accent } = categoryVisual(asset.category);

  return (
    <header className={`asset-hero asset-hero--${accent}`}>
      <div className="asset-hero__glow" aria-hidden="true" />
      <div className="asset-hero__shine" aria-hidden="true" />

      <button
        className="asset-hero__close"
        onClick={onClose}
        type="button"
        aria-label="Fechar"
      >
        ✕
      </button>

      <div className="asset-hero__row">
        <div className="asset-hero__icon" aria-hidden="true">
          {icon}
        </div>

        <div className="asset-hero__text">
          <span className="asset-hero__eyebrow">
            {CATEGORY_LABEL[asset.category] ?? asset.category}
          </span>
          <h2 className="asset-hero__title">{asset.model}</h2>
          <div className="asset-hero__chips">
            <code className="asset-hero__chip">{asset.serialNumber}</code>
            {asset.imei && (
              <code className="asset-hero__chip">IMEI {asset.imei}</code>
            )}
          </div>
        </div>
      </div>

      <div className="asset-hero__meta">
        <span className={`asset-hero__status asset-hero__status--${asset.status}`}>
          <span className="asset-hero__dot" aria-hidden="true" />
          {STATUS_LABEL[asset.status]}
        </span>
        {asset.isArchived && (
          <span className="asset-hero__status asset-hero__status--arch">
            Arquivado
          </span>
        )}
        <span
          className={`asset-hero__loc ${asset.currentUnit ? '' : 'asset-hero__loc--none'}`}
        >
          <PinIcon />
          {asset.currentUnit ? asset.currentUnit.name : 'Sem unidade'}
        </span>
      </div>
    </header>
  );
}
