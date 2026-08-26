import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { householdsApi } from '../api/households';
import { useHousehold } from '../contexts/HouseholdContext';
import type { HouseholdMember } from '../types/api';

/**
 * Shared "accept this invite token" flow — used by both InviteAcceptPage
 * (arriving via the copied link) and InvitesPage (arriving via the sidebar
 * list). Accepts, refetches the household list to pick up the new
 * membership, activates the joined household, and invalidates the pending
 * invites list so the accepted one disappears from both places.
 */
export function useAcceptInvite() {
  const { refetch: refetchHouseholds, setActiveHousehold } = useHousehold();
  const qc = useQueryClient();

  return useCallback(
    async (token: string): Promise<HouseholdMember> => {
      const member = await householdsApi.acceptInvite(token);
      const result = await refetchHouseholds();
      const joined = result.data?.find((h) => h.id === member.householdId);
      if (joined) setActiveHousehold(joined);
      qc.invalidateQueries({ queryKey: ['my-invites'] });
      return member;
    },
    [refetchHouseholds, setActiveHousehold, qc],
  );
}
