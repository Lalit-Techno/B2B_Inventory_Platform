// Buyer storefront, mobile-first. Tenant branding (brandVars) is applied here from Phase 2.
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl p-4">{children}</div>;
}
