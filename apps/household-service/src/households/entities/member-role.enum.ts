export enum MemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export const ROLE_WEIGHT: Record<MemberRole, number> = {
  [MemberRole.OWNER]: 4,
  [MemberRole.ADMIN]: 3,
  [MemberRole.MEMBER]: 2,
  [MemberRole.VIEWER]: 1,
};

export function canManage(actor: MemberRole, target: MemberRole): boolean {
  return ROLE_WEIGHT[actor] > ROLE_WEIGHT[target];
}

// Whether `grantor` may hand out `role` — same strict-inequality rule as
// canManage, but semantically distinct: canManage protects an existing member
// from a peer, canGrant protects the role hierarchy from peer elevation
// (an ADMIN inviting another ADMIN, or promoting a MEMBER to ADMIN).
export function canGrant(grantor: MemberRole, role: MemberRole): boolean {
  return ROLE_WEIGHT[grantor] > ROLE_WEIGHT[role];
}
