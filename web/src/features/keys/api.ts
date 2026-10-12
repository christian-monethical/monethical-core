import { api, body } from '../../api/client';
import type { KeyCreated, KeyOut, KeyScope } from '../../api/types';

const site = (siteId: string) => ({ params: { path: { site_id: siteId } } });
const key = (siteId: string, keyId: string) => ({ params: { path: { site_id: siteId, key_id: keyId } } });

export const listKeys = async (siteId: string): Promise<KeyOut[]> =>
  body(await api.GET('/v1/sites/{site_id}/keys', site(siteId)));

export const createKey = async (siteId: string, payload: { label: string; scopes: KeyScope[] }): Promise<KeyCreated> =>
  body(await api.POST('/v1/sites/{site_id}/keys', { ...site(siteId), body: payload }));

export const rotateKey = async (siteId: string, keyId: string): Promise<KeyCreated> =>
  body(await api.POST('/v1/sites/{site_id}/keys/{key_id}/rotate', key(siteId, keyId)));

export const revokeKey = async (siteId: string, keyId: string): Promise<void> => {
  await api.DELETE('/v1/sites/{site_id}/keys/{key_id}', key(siteId, keyId));
};
