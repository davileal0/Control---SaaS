import { useCallback, useEffect, useState } from 'react';
import { api, Metrics, PeripheralBreakdown } from './api';

// Dados de exemplo para visualizar a UI sem o back-end no ar.
// Em ambiente real, o fetch tem prioridade; o sample só entra no catch.
//
// Sample escolhido propositalmente pra exercitar o cenário de alerta:
// "Suporte para notebook" e "Mochila" têm <= 3 unidades disponíveis
// e devem aparecer com o ícone de alerta amarelo. "Régua" com 5
// aparece sem alerta (entre os 3 menores mas acima do limite).
const SAMPLE_METRICS: Metrics = {
  byStatus: { Disponivel: 42, EmUso: 118, Danificado: 7 },
  byCategory: {
    Notebook:   { Disponivel: 12, EmUso: 45, Danificado: 2 },
    Celular:    { Disponivel: 3,  EmUso: 18, Danificado: 1 },
    AllInOne:   { Disponivel: 2,  EmUso: 8,  Danificado: 0 },
    Desktop:    { Disponivel: 5,  EmUso: 22, Danificado: 1 },
    Periferico: { Disponivel: 20, EmUso: 25, Danificado: 3 },
  },
  total: 167,
};
const SAMPLE_PERIPHERALS: PeripheralBreakdown = {
  total: 96,
  items: [
    { model: 'Mouse',                  available: 22, inUse: 12, damaged: 0, total: 34 },
    { model: 'Teclado',                available: 18, inUse: 10, damaged: 0, total: 28 },
    { model: 'Headset',                available:  8, inUse:  4, damaged: 0, total: 12 },
    { model: 'Mousepad',               available:  7, inUse:  2, damaged: 0, total:  9 },
    { model: 'Régua de filtro de linha', available: 5, inUse: 1, damaged: 0, total: 6 },
    { model: 'Mochila',                available:  2, inUse:  2, damaged: 0, total:  4 },
    { model: 'Suporte para notebook',  available:  1, inUse:  2, damaged: 0, total:  3 },
  ],
};

export function useDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [peripherals, setPeripherals] = useState<PeripheralBreakdown | null>(null);
  const [usingSample, setUsingSample] = useState(false);
  const [loading, setLoading] = useState(true);

  // Carrega (ou recarrega) as métricas gerais. NÃO mexe em `loading` além
  // do fim — assim um refresh não pisca o spinner de tela cheia.
  const refresh = useCallback(() => {
    return Promise.all([api.metrics(), api.peripherals()])
      .then(([m, p]) => {
        setMetrics(m);
        setPeripherals(p);
        setUsingSample(false);
      })
      .catch(() => {
        setMetrics(SAMPLE_METRICS);
        setPeripherals(SAMPLE_PERIPHERALS);
        setUsingSample(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { metrics, peripherals, usingSample, loading, refresh };
}
