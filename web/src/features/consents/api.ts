import { api, body, download } from '../../api/client';
import type { Consent, Page } from '../../api/types';

export const listConsents = async (siteId: string, cursor: string | undefined): Promise<Page<Consent>> =>
  body(
    await api.GET('/v1/sites/{site_id}/consents', {
      params: { path: { site_id: siteId }, query: { limit: 50, cursor } },
    }),
  );

/** Authenticated fetch of the CSV, saved through a temporary object URL. */
export async function downloadConsentsCsv(siteId: string): Promise<void> {
  const blob = await download(`/v1/sites/${encodeURIComponent(siteId)}/consents.csv`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `consents-${siteId}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
