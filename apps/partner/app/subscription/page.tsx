import variant from '@variant';
import { loadIpos } from '@/core/data.server';
import { subscriptionModel } from '@/core/models';

export const metadata = { title: 'IPO subscription' };

export default async function Subscription() {
  return <variant.SubscriptionPage model={subscriptionModel(await loadIpos())} />;
}
