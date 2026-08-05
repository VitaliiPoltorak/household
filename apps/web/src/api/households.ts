import { apiClient } from './client';
import type { Household, HouseholdMember, HouseholdInvite, MemberRole } from '../types/api';

const h = (householdId: string) => ({ headers: { 'X-Household-Id': householdId } });

export const householdsApi = {
  list: () => apiClient.get<Household[]>('/households').then((r) => r.data),

  create: (name: string) =>
    apiClient.post<Household>('/households', { name }).then((r) => r.data),

  get: (id: string, householdId: string) =>
    apiClient.get<Household>(`/households/${id}`, h(householdId)).then((r) => r.data),

  update: (id: string, householdId: string, name: string) =>
    apiClient.patch<Household>(`/households/${id}`, { name }, h(householdId)).then((r) => r.data),

  remove: (id: string, householdId: string) =>
    apiClient.delete(`/households/${id}`, h(householdId)),

  // Members
  getMembers: (id: string, householdId: string) =>
    apiClient.get<HouseholdMember[]>(`/households/${id}/members`, h(householdId)).then((r) => r.data),

  updateMemberRole: (id: string, memberId: string, role: MemberRole, householdId: string) =>
    apiClient
      .patch<HouseholdMember>(`/households/${id}/members/${memberId}`, { role }, h(householdId))
      .then((r) => r.data),

  removeMember: (id: string, memberId: string, householdId: string) =>
    apiClient.delete(`/households/${id}/members/${memberId}`, h(householdId)),

  // Invites
  createInvite: (id: string, email: string, role: MemberRole, householdId: string) =>
    apiClient
      .post<HouseholdInvite>(`/households/${id}/invites`, { email, role }, h(householdId))
      .then((r) => r.data),

  getInvites: (id: string, householdId: string) =>
    apiClient.get<HouseholdInvite[]>(`/households/${id}/invites`, h(householdId)).then((r) => r.data),

  deleteInvite: (id: string, inviteId: string, householdId: string) =>
    apiClient.delete(`/households/${id}/invites/${inviteId}`, h(householdId)),

  acceptInvite: (token: string) =>
    apiClient.post<HouseholdMember>(`/invites/${token}/accept`).then((r) => r.data),
};
