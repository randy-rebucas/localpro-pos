import { redirect } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import RootNotFound from './not-found';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  try {
    await connectDB();
    const tenants = await Tenant.find({ isActive: true })
      .select('slug')
      .lean();

    if (tenants.length === 1) {
      // Single tenant — redirect directly
      redirect(`/${tenants[0].slug}/en`);
    }

    if (tenants.length > 1) {
      // Multiple tenants — show store selector
      return <RootNotFound />;
    }
  } catch {
    // DB not reachable — show store selector (it will handle the empty state)
    return <RootNotFound />;
  }

  // No tenants — redirect to signup
  redirect('/signup');
}
