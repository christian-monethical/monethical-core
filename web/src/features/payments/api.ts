import { api, body } from '../../api/client';
import type { StripeStatus } from '../../api/types';

export const getStripeStatus = async (): Promise<StripeStatus> => body(await api.GET('/v1/stripe/status'));

/** Returns the Stripe-hosted onboarding URL. */
export async function startOnboarding(returnUrl: string, refreshUrl: string): Promise<string> {
  const res = body(await api.POST('/v1/stripe/connect', { body: { return_url: returnUrl, refresh_url: refreshUrl } }));
  return res.url;
}
