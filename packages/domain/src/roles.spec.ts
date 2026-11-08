import { describe, expect, it } from 'vitest';
import {
  ADMINISTRATION_ROLES,
  isAdministrationRole,
  ROLE_CIO,
  ROLE_COMPANY_ADMIN,
  ROLE_EMPLOYEE,
  ROLE_HOLDING_ADMIN,
  ROLE_HUB_ADMIN,
} from './roles';

describe('comptes d’administration', () => {
  it('les deux comptes de secours et l’Administrateur HUB', () => {
    expect([...ADMINISTRATION_ROLES].sort()).toEqual([ROLE_COMPANY_ADMIN, ROLE_HOLDING_ADMIN, ROLE_HUB_ADMIN].sort());
    for (const nom of ADMINISTRATION_ROLES) expect(isAdministrationRole(nom)).toBe(true);
  });

  it('le CIO et les rôles métier n’en font pas partie', () => {
    expect(isAdministrationRole(ROLE_CIO)).toBe(false);
    expect(isAdministrationRole(ROLE_EMPLOYEE)).toBe(false);
    expect(isAdministrationRole('')).toBe(false);
  });
});
