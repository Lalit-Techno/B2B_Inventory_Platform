import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import type { Principal } from '../../common/auth/principal';
import { AppError } from '../../common/errors/app-error';
import { Role } from '../../common/rbac/roles';
import { contrastWithWhite } from '../../common/validation/validators';
import {
  UpdateBankDto,
  UpdateBrandingDto,
  UpdateContactDto,
} from './dto/organization.dto';
import { Organization, OrgStatus } from './schemas/organization.schema';
import { SettingsSection, withDefaults } from './settings';

/** Roles that hold TEN-09 (invoice and bank settings), so they may see the bank details. */
const BANK_ROLES = new Set<Role>([Role.ORG_ADMIN, Role.FINANCE_MANAGER]);

const maskAccount = (n?: string) =>
  n ? `${'X'.repeat(Math.max(0, n.length - 4))}${n.slice(-4)}` : undefined;

/** Dotted `$set` paths for the fields that were actually sent, so a PATCH never wipes its siblings. */
const dotted = (prefix: string, dto: object) =>
  Object.fromEntries(
    Object.entries(dto)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [`${prefix}.${k}`, v]),
  );

/**
 * The signed-in tenant's own organization: profile, branding, bank details and settings.
 * Organization is never looked up by input: the id comes from the token (Rules 2.1).
 */
@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(Organization.name) private readonly orgs: Model<Organization>,
    private readonly audit: AuditService,
  ) {}

  private async load(p: Principal) {
    // Platform users have no organization of their own and never read tenant data.
    if (!p.organizationId) throw new AppError('FORBIDDEN', 'Not allowed');
    const org = await this.orgs.findById(p.organizationId).lean();
    if (!org) throw new AppError('NOT_FOUND', 'Organization not found');
    return org;
  }

  async profile(p: Principal) {
    const org = await this.load(p);
    return {
      slug: org.slug,
      legalName: org.legalName,
      tradeName: org.tradeName ?? null,
      gstin: org.gstin ?? null,
      pan: org.pan ?? null,
      stateCode: org.stateCode ?? null,
      email: org.email ?? null,
      phone: org.phone ?? null,
      address: org.address ?? null,
      invoicePrefix: org.invoicePrefix ?? null,
      branding: org.branding ?? {},
      status: org.status,
      // Only the roles that may edit them see bank details, and the account number is masked.
      ...(BANK_ROLES.has(p.role) && {
        bankDetails: this.bankView(org.bankDetails),
      }),
    };
  }

  private bankView(bank?: Record<string, string>) {
    return bank
      ? { ...bank, accountNumber: maskAccount(bank.accountNumber) }
      : null;
  }

  async updateContact(p: Principal, dto: UpdateContactDto, ip?: string) {
    const set = {
      ...(dto.tradeName !== undefined && { tradeName: dto.tradeName }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.address !== undefined && { address: { ...dto.address } }),
    };
    return this.apply(p, 'organization.contact.updated', set, ip);
  }

  async updateBranding(p: Principal, dto: UpdateBrandingDto, ip?: string) {
    if (dto.primaryColor && contrastWithWhite(dto.primaryColor) < 3)
      throw new AppError(
        'VALIDATION_ERROR',
        'The primary colour is too light: it must have a contrast of at least 3:1 against white',
        { field: 'primaryColor' },
      );
    return this.apply(
      p,
      'organization.branding.updated',
      dotted('branding', dto),
      ip,
    );
  }

  async updateBank(p: Principal, dto: UpdateBankDto, ip?: string) {
    return this.apply(
      p,
      'organization.bank.updated',
      { bankDetails: { ...dto } },
      ip,
    );
  }

  async settings(p: Principal) {
    return withDefaults((await this.load(p)).settings);
  }

  async updateSettings(
    p: Principal,
    section: SettingsSection,
    dto: object,
    ip?: string,
  ) {
    await this.apply(
      p,
      `organization.settings.${section}.updated`,
      dotted(`settings.${section}`, dto),
      ip,
    );
    return this.settings(p);
  }

  /** Public branding for the storefront login: nothing but how the shop looks. */
  async publicConfig(slug: string) {
    const org = await this.orgs
      .findOne({
        slug: slug.toLowerCase(),
        status: { $ne: OrgStatus.OFFBOARDED },
      })
      .lean();
    if (!org) throw new AppError('NOT_FOUND', 'Organization not found');
    const b = org.branding ?? {};
    return {
      slug: org.slug,
      name: b.displayName ?? org.tradeName ?? org.legalName,
      primaryColor: b.primaryColor ?? null,
      secondaryColor: b.secondaryColor ?? null,
      accentColor: b.accentColor ?? null,
    };
  }

  /** Guarded update of the caller's organization, audited with before / after (secrets are redacted). */
  private async apply(
    p: Principal,
    action: string,
    set: Record<string, unknown>,
    ip?: string,
  ) {
    if (Object.keys(set).length === 0)
      throw new AppError('VALIDATION_ERROR', 'Nothing to update');
    const before = await this.load(p);
    const after = await this.orgs
      .findByIdAndUpdate(
        p.organizationId,
        { $set: set },
        { new: true, runValidators: true },
      )
      .lean();
    if (!after) throw new AppError('NOT_FOUND', 'Organization not found');
    const keys = Object.keys(set).map((k) => k.split('.')[0]);
    const pick = (o: Organization) =>
      Object.fromEntries(
        keys.map((k) => [k, (o as unknown as Record<string, unknown>)[k]]),
      );
    await this.audit.record({
      actor: p,
      action,
      entityType: 'Organization',
      entityId: p.organizationId,
      before: pick(before),
      after: pick(after),
      ip,
    });
    return this.profile(p);
  }
}
