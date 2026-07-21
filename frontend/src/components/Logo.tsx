import BrandIcon from './BrandIcon';
import './logo.css';

// Logotipo: ícone radar + wordmark (Con regular / trol semi-bold) +
// eyebrow contextual "Controle de ativos".
export default function Logo() {
  return (
    <div className="logo">
      <BrandIcon size={44} />
      <div className="logo__stack">
        <span className="logo__word">
          <span className="logo__con">Con</span>
          <span className="logo__trol">trol</span>
        </span>
        <span className="logo__eyebrow">Controle de ativos</span>
      </div>
    </div>
  );
}
