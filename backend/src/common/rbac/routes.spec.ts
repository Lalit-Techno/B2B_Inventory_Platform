import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import 'reflect-metadata';
import { AUTHORIZE_KEY, LIMITED_KEY, PUBLIC_KEY } from './authorize.decorator';
import { isAllowed, PERMISSIONS, PermissionId } from './permissions';
import { Role } from './roles';

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('every route is guarded', () => {
  const srcDir = join(__dirname, '..', '..');
  const routes: {
    name: string;
    ok: boolean;
    id?: string;
    base: string;
    limited: boolean;
  }[] = [];

  for (const file of controllerFiles(srcDir)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (
        typeof exported !== 'function' ||
        !Reflect.hasMetadata('path', exported)
      )
        continue;
      const cls = exported as {
        prototype: Record<string, unknown>;
        name: string;
      };
      const classPublic = Reflect.getMetadata(PUBLIC_KEY, cls) === true;
      const classId = Reflect.getMetadata(AUTHORIZE_KEY, cls) as
        string | undefined;

      for (const method of Object.getOwnPropertyNames(cls.prototype)) {
        const handler = cls.prototype[method];
        if (method === 'constructor' || typeof handler !== 'function') continue;
        if (!Reflect.hasMetadata('method', handler)) continue; // not a route
        const isPublic =
          classPublic || Reflect.getMetadata(PUBLIC_KEY, handler) === true;
        const id =
          (Reflect.getMetadata(AUTHORIZE_KEY, handler) as string | undefined) ??
          classId;
        routes.push({
          name: `${cls.name}.${method}`,
          ok: isPublic || !!id,
          id,
          base: Reflect.getMetadata('path', cls) as string,
          limited:
            Reflect.getMetadata(LIMITED_KEY, handler) === true ||
            Reflect.getMetadata(LIMITED_KEY, cls) === true,
        });
      }
    }
  }

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it('has @Public() or @Authorize(id) on every route', () => {
    expect(routes.filter((r) => !r.ok).map((r) => r.name)).toEqual([]);
  });

  it('only uses permission ids that exist in the RBAC matrix', () => {
    const unknown = routes
      .filter((r) => r.id && !(r.id in PERMISSIONS))
      .map((r) => r.name);
    expect(unknown).toEqual([]);
  });

  // A permission matrix cell can say "L" (limited: own tenant only). Platform routes under /super have no
  // such restriction in their service, so no role except the Super Admin may ever pass them.
  it('keeps every /super route Super Admin only, whatever the matrix says for other roles', () => {
    const superRoutes = routes.filter((r) => r.base.startsWith('super'));
    expect(superRoutes.length).toBeGreaterThan(5);
    const others: [Role, string?][] = [
      [Role.ORG_ADMIN],
      [Role.INVENTORY_MANAGER],
      [Role.SALES_MANAGER],
      [Role.FINANCE_MANAGER],
      [Role.BUYER_USER, 'ACTIVE'],
      [Role.BUYER_USER, 'PENDING'],
    ];
    const leaks = superRoutes.flatMap((r) =>
      others
        // evaluated exactly as the guard does, with the route's own @Limited flag
        .filter(([role, state]) =>
          isAllowed(r.id as PermissionId, role, state, r.limited),
        )
        .map(([role]) => `${r.name} allows ${role}`),
    );
    expect(leaks).toEqual([]);
    expect(superRoutes.filter((r) => r.limited).map((r) => r.name)).toEqual([]);
  });
});
