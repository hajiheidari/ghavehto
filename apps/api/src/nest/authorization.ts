export type CafeMembership = {
  userId: string; cafeId: string; branchId: string | null; role: 'owner' | 'manager' | 'staff';
};
export function hasCafePermission(
  actorId: string, memberships: readonly CafeMembership[], cafeId: string,
  action: 'read_branch' | 'edit_profile' | 'award_stamp', branchId?: string,
): boolean {
  return memberships.some(m => {
    if (m.userId !== actorId || m.cafeId !== cafeId) return false;
    if (action === 'edit_profile') return m.role === 'owner' && m.branchId === null;
    if (!branchId) return false;
    return m.branchId === null || m.branchId === branchId;
  });
}
