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
