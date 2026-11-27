import { Role } from '../../common/rbac/roles';

export type SettingsSection = 'commercial' | 'credit' | 'invoice' | 'stock';

export type StockVisibility = 'EXACT' | 'BANDED' | 'FLAG';

/**
 * Business-rule settings, stored as JSON on the organization in four sections. Each section has its
 * own edit permission (TEN-07 commercial, TEN-08 credit, TEN-09 invoice, TEN-10 stock).
 * Money thresholds are decimal strings; compare them with decimal.js, never as numbers.
 */
export interface TenantSettings {
  commercial: {
    minOrderValue: string;
    stockVisibility: StockVisibility;
    pendingCatalogPreview: boolean;
    autoAckHours: number;
    maxTierDiscountPct: string;
  };
  credit: { overdueBlockDays: number };
  invoice: { roundOff: boolean; creditNoteApprovalValue: string };
  stock: { lowStockRoles: Role[]; stockAdjustmentApprovalValue: string };
}

export const SETTINGS_DEFAULTS: TenantSettings = {
  commercial: {
    minOrderValue: '0',
    stockVisibility: 'EXACT',
    pendingCatalogPreview: false,
    autoAckHours: 72,
    maxTierDiscountPct: '10',
  },
  credit: { overdueBlockDays: 45 },
  invoice: { roundOff: true, creditNoteApprovalValue: '25000' },
  stock: {
    lowStockRoles: [Role.ORG_ADMIN, Role.INVENTORY_MANAGER, Role.SALES_MANAGER],
    stockAdjustmentApprovalValue: '25000',
  },
};

/** Stored settings laid over the defaults, so a tenant that never saved anything still has every key. */
export function withDefaults(stored: Record<string, unknown> = {}) {
  const out = {} as Record<string, unknown>;
  for (const section of Object.keys(SETTINGS_DEFAULTS) as SettingsSection[]) {
    out[section] = {
      ...SETTINGS_DEFAULTS[section],
      ...(stored[section] ?? {}),
    };
  }
  return out as unknown as TenantSettings;
}
