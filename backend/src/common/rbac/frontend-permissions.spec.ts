import { readFileSync } from 'node:fs';
import {
  FRONTEND_PERMISSIONS_PATH,
  renderFrontendPermissions,
} from '../../../scripts/frontend-permissions';

it('frontend/src/lib/permissions.ts matches the backend matrix (run scripts/frontend-permissions.ts)', () => {
  expect(readFileSync(FRONTEND_PERMISSIONS_PATH, 'utf8')).toBe(
    renderFrontendPermissions(),
  );
});
