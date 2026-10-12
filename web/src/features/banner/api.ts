import { api, body } from '../../api/client';
import type { BannerConfig, BannerStored } from '../../api/types';

export const getBanner = async (siteId: string): Promise<BannerStored> =>
  body(await api.GET('/v1/sites/{site_id}/banner', { params: { path: { site_id: siteId } } }));

export const saveBanner = async (siteId: string, config: BannerConfig): Promise<BannerStored> =>
  body(await api.PUT('/v1/sites/{site_id}/banner', { params: { path: { site_id: siteId } }, body: config }));
