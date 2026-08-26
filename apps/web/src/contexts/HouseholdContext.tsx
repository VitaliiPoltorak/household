import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryObserverResult,
} from '@tanstack/react-query';
import type { Household } from '../types/api';
import { householdsApi } from '../api/households';
import { storage } from '../lib/storage';
import { useAuth } from './AuthContext';

interface HouseholdContextValue {
  households: Household[];
  activeHousehold: Household | null;
  setActiveHousehold: (h: Household) => void;
  isLoading: boolean;
  refetch: () => Promise<QueryObserverResult<Household[], Error>>;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

const ACTIVE_KEY = 'activeHouseholdId';

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: households = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['households'],
    queryFn: () => householdsApi.list(),
    enabled: !!user,
  });

  const [activeId, setActiveId] = useState<string | null>(
    storage.get(ACTIVE_KEY),
  );

  const activeHousehold =
    households.find((h) => h.id === activeId) ?? households[0] ?? null;

  const setActiveHousehold = useCallback(
    (h: Household) => {
      setActiveId(h.id);
      storage.set(ACTIVE_KEY, h.id);
      queryClient.invalidateQueries({ queryKey: ['household'] });
    },
    [queryClient],
  );

  return (
    <HouseholdContext.Provider
      value={{
        households,
        activeHousehold,
        setActiveHousehold,
        isLoading,
        refetch,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx)
    throw new Error('useHousehold must be used within HouseholdProvider');
  return ctx;
}
