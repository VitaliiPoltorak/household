import { api } from './client';
import type { Household, HouseholdMember, HouseholdInvite, MemberRole } from '../types/api';

const h = (householdId: string) => ({ headers: { 'X-Household-Id': householdId } });

export const householdsApi = {
  list: () => api.get<Household[]>('/households'),

  create: (name: string) => api.post<Household>('/households', { name }),

  get: (id: string, householdId: string) =>
    api.get<Household>(`/households/${id}`, h(householdId)),

  update: (id: string, householdId: string, name: string) =>
    api.patch<Household>(`/households/${id}`, { name }, h(householdId)),

  remove: (id: string, householdId: string) =>
    api.delete(`/households/${id}`, h(householdId)),

  // Members
  getMembers: (id: string, householdId: string) =>
    api.get<HouseholdMember[]>(`/households/${id}/members`, h(householdId)),

  updateMemberRole: (id: string, memberId: string, role: MemberRole, householdId: string) =>
    api.patch<HouseholdMember>(`/households/${id}/members/${memberId}`, { role }, h(householdId)),

  removeMember: (id: string, memberId: string, householdId: string) =>
    api.delete(`/households/${id}/members/${memberId}`, h(householdId)),

  // Invites
  createInvite: (id: string, email: string, role: MemberRole, householdId: string) =>
    api.post<HouseholdInvite>(`/households/${id}/invites`, { email, role }, h(householdId)),

  getInvites: (id: string, householdId: string) =>
    api.get<HouseholdInvite[]>(`/households/${id}/invites`, h(householdId)),

  deleteInvite: (id: string, inviteId: string, householdId: string) =>
    api.delete(`/households/${id}/invites/${inviteId}`, h(householdId)),

  acceptInvite: (token: string) =>
    api.post<HouseholdMember>(`/invites/${token}/accept`),
};
