import { isAllowed, PERMISSIONS } from './permissions';
import { Role } from './roles';

describe('permission matrix', () => {
  it('has all 130 permissions from the RBAC spec', () => {
    expect(Object.keys(PERMISSIONS)).toHaveLength(130);
  });

  it('PLT-01 (plans) is Super Admin only', () => {
    expect(isAllowed('PLT-01', Role.SUPER_ADMIN)).toBe(true);
    for (const role of [
      Role.ORG_ADMIN,
      Role.INVENTORY_MANAGER,
      Role.SALES_MANAGER,
      Role.FINANCE_MANAGER,
    ]) {
      expect(isAllowed('PLT-01', role)).toBe(false);
    }
  });

  it('own-profile permission is open to every role (buyers need an ACTIVE or PENDING connection)', () => {
    expect(isAllowed('TEN-18', Role.INVENTORY_MANAGER)).toBe(true);
    expect(isAllowed('TEN-18', Role.BUYER_USER, 'ACTIVE')).toBe(true);
    expect(isAllowed('TEN-18', Role.BUYER_USER, 'PENDING')).toBe(true);
    expect(isAllowed('TEN-18', Role.BUYER_USER, 'REVOKED')).toBe(false);
    expect(isAllowed('TEN-18', Role.BUYER_USER)).toBe(false);
  });

  it('approver (A) is allowed, break-glass (B) and unknown ids are not', () => {
    expect(isAllowed('PLT-09', Role.SUPER_ADMIN)).toBe(true); // A (approver)
    expect(isAllowed('BYR-02', Role.SUPER_ADMIN)).toBe(false); // B (break-glass)
    expect(isAllowed('XXX-00' as never, Role.SUPER_ADMIN)).toBe(false);
  });
});

describe('platform permissions (PLT-*) per role', () => {
  const STAFF = [
    Role.ORG_ADMIN,
    Role.INVENTORY_MANAGER,
    Role.SALES_MANAGER,
    Role.FINANCE_MANAGER,
  ];
  const PLT = Object.keys(PERMISSIONS).filter((id) => id.startsWith('PLT-'));

  // Straight from the RBAC spec matrix. Y / A pass; L passes only on a route marked @Limited().
  const SUPER_ADMIN_ALLOWED = [
    'PLT-01',
    'PLT-02',
    'PLT-03',
    'PLT-04',
    'PLT-05',
    'PLT-06',
    'PLT-07',
    'PLT-08',
    'PLT-09',
    'PLT-11',
    'PLT-12',
    'PLT-13',
    'PLT-15',
    'PLT-16',
  ]; // not PLT-10 (nobody), PLT-14 (break-glass L), PLT-17 (L)
  const ORG_ADMIN_LIMITED = ['PLT-02', 'PLT-05', 'PLT-07', 'PLT-13']; // L
  const FINANCE_LIMITED = ['PLT-02', 'PLT-05', 'PLT-07'];

  it('there are 17 platform permissions', () => {
    expect(PLT).toHaveLength(17);
  });

  it('Super Admin holds exactly the expected ones', () => {
    expect(
      PLT.filter((id) => isAllowed(id as never, Role.SUPER_ADMIN)),
    ).toEqual(SUPER_ADMIN_ALLOWED);
  });

  it('Org Admin: PLT-15 outright, and L on the own-tenant views only on @Limited() routes', () => {
    const plain = PLT.filter((id) => isAllowed(id as never, Role.ORG_ADMIN));
    expect(plain).toEqual(['PLT-15']);
    const limited = PLT.filter((id) =>
      isAllowed(id as never, Role.ORG_ADMIN, undefined, true),
    );
    expect(limited).toEqual([...ORG_ADMIN_LIMITED, 'PLT-15'].sort());
  });

  it('Finance Manager: only the L views, only on @Limited() routes', () => {
    expect(
      PLT.filter((id) => isAllowed(id as never, Role.FINANCE_MANAGER)),
    ).toEqual([]);
    expect(
      PLT.filter((id) =>
        isAllowed(id as never, Role.FINANCE_MANAGER, undefined, true),
      ),
    ).toEqual(FINANCE_LIMITED);
  });

  it('Inventory and Sales managers and buyers hold no platform permission, even on @Limited() routes', () => {
    for (const id of PLT) {
      for (const role of [Role.INVENTORY_MANAGER, Role.SALES_MANAGER]) {
        expect(isAllowed(id as never, role, undefined, true)).toBe(false);
      }
      for (const state of ['ACTIVE', 'PENDING']) {
        expect(isAllowed(id as never, Role.BUYER_USER, state, true)).toBe(
          false,
        );
      }
    }
    expect(STAFF).toHaveLength(4);
  });

  it('nobody can edit or delete ledger rows (PLT-10)', () => {
    for (const role of [Role.SUPER_ADMIN, ...STAFF]) {
      expect(isAllowed('PLT-10', role, undefined, true)).toBe(false);
    }
  });
});
