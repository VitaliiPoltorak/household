import { useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { householdsApi } from '../api/households';
import type { Household } from '../api/types';
import { useAuth } from '../auth/AuthContext';

interface HouseholdState {
  households: Household[];
  /** Selected household, or the first one until the user picks. Null if they have none. */
  activeHousehold: Household | null;
  setActiveHousehold: (h: Household) => void;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const ACTIVE_KEY = 'active_household_id';

const HouseholdContext = createContext<HouseholdState | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['households'],
    queryFn: householdsApi.list,
    enabled: !!user,
  });

  // The choice is a convenience, not a secret — but SecureStore is already
  // the app's only persistent store, so no second storage dependency.
  useEffect(() => {
    SecureStore.getItemAsync(ACTIVE_KEY)
      .then(setActiveId)
      .catch(() => undefined);
  }, []);

  const households = query.data ?? [];
  const activeHousehold =
    households.find((h) => h.id === activeId) ?? households[0] ?? null;

  const setActiveHousehold = useCallback((h: Household) => {
    setActiveId(h.id);
    SecureStore.setItemAsync(ACTIVE_KEY, h.id).catch(() => undefined);
  }, []);

  const value = useMemo<HouseholdState>(
    () => ({
      households,
      activeHousehold,
      setActiveHousehold,
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: () => void query.refetch(),
    }),
    // `households` is a fresh [] when data is undefined; key off the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      query.data,
      activeHousehold,
      setActiveHousehold,
      query.isLoading,
      query.isError,
    ],
  );
  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold(): HouseholdState {
  const ctx = useContext(HouseholdContext);
  if (!ctx)
    throw new Error('useHousehold must be used inside <HouseholdProvider>');
  return ctx;
}
