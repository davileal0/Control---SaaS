import { useEffect, useState } from 'react';
import { api } from './api';
import { Unit } from '../types/domain';

/** Carrega as unidades ativas (pro seletor de localização). */
export function useUnits() {
  const [units, setUnits] = useState<Unit[]>([]);
  useEffect(() => {
    api.listUnits().then(setUnits).catch(() => setUnits([]));
  }, []);
  return units;
}
