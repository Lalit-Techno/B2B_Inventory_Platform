import { PageHeader } from "@/components/page-header";

export default async function ShopHome({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  return <PageHeader title={`Storefront: ${orgSlug}`} subtitle="Catalog and ordering arrive in Phase 3." />;
}
