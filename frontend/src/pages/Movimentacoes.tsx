import { useState } from 'react';
import { Role } from '../types/domain';
import AssignmentsPanel from './AssignmentsPanel';
import PendenciasPanel from './PendenciasPanel';
import './movimentacoes.css';

interface Props {
  role: Role | null;
}

type Tab = 'atribuicoes' | 'pendencias';

// Página Movimentações: reúne as atribuições de ativos rastreáveis a
// chamados e, como aba, as pendências de periférico.
export default function Movimentacoes({ role }: Props) {
  const [tab, setTab] = useState<Tab>('atribuicoes');

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Operação</span>
        <h1>Movimentações</h1>
        <p>Atribuições de ativos a chamados e periféricos pendentes de entrega.</p>
      </div>

      <div className="mov-tabs" role="tablist" aria-label="Seções de movimentações">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'atribuicoes'}
          className={`mov-tab ${tab === 'atribuicoes' ? 'is-active' : ''}`}
          onClick={() => setTab('atribuicoes')}
        >
          Atribuições
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pendencias'}
          className={`mov-tab ${tab === 'pendencias' ? 'is-active' : ''}`}
          onClick={() => setTab('pendencias')}
        >
          Pendências
        </button>
      </div>

      {tab === 'atribuicoes' ? <AssignmentsPanel /> : <PendenciasPanel role={role} />}
    </>
  );
}
