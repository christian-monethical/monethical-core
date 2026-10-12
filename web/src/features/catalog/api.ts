import { api, body } from '../../api/client';
import type { DayAvailability, ItemConfig, ItemStored, PriceOverride } from '../../api/types';

const site = (siteId: string) => ({ params: { path: { site_id: siteId } } });
const item = (siteId: string, itemId: string) => ({ params: { path: { site_id: siteId, item_id: itemId } } });

export const listItems = async (siteId: string): Promise<ItemStored[]> =>
  body(await api.GET('/v1/sites/{site_id}/items', site(siteId)));

export const createItem = async (siteId: string, config: ItemConfig): Promise<ItemStored> =>
  body(await api.POST('/v1/sites/{site_id}/items', { ...site(siteId), body: config }));

export const updateItem = async (siteId: string, itemId: string, config: ItemConfig): Promise<ItemStored> =>
  body(await api.PUT('/v1/sites/{site_id}/items/{item_id}', { ...item(siteId, itemId), body: config }));

export const deleteItem = async (siteId: string, itemId: string): Promise<void> => {
  await api.DELETE('/v1/sites/{site_id}/items/{item_id}', item(siteId, itemId));
};

export const listPrices = async (siteId: string, itemId: string): Promise<PriceOverride[]> =>
  body(await api.GET('/v1/sites/{site_id}/items/{item_id}/prices', item(siteId, itemId)));

/** Per-day availability for `[from, to)`, including manually blocked days and bookings. */
export const getCalendar = async (siteId: string, itemId: string, from: string, to: string): Promise<DayAvailability[]> =>
  body(await api.GET('/v1/sites/{site_id}/items/{item_id}/calendar', { params: { path: { site_id: siteId, item_id: itemId }, query: { from, to } } }));

export const setPrice = async (
  siteId: string,
  itemId: string,
  payload: { date: string; price_cents: number; slot?: string },
): Promise<void> => {
  await api.PUT('/v1/sites/{site_id}/items/{item_id}/prices', { ...item(siteId, itemId), body: payload });
};

export const clearPrice = async (siteId: string, itemId: string, day: string): Promise<void> => {
  const [date = day, slot] = day.split('T');
  await api.DELETE('/v1/sites/{site_id}/items/{item_id}/prices/{day}', {
    params: { path: { site_id: siteId, item_id: itemId, day: date }, query: slot ? { slot } : undefined },
  });
};

/** Block (or unblock) the nights in `[start, end)`; the server limits the range to 90 days. */
export const blockDays = async (
  siteId: string,
  itemId: string,
  range: { start: string; end: string; blocked: boolean },
): Promise<void> => {
  await api.POST('/v1/sites/{site_id}/items/{item_id}/block', { ...item(siteId, itemId), body: range });
};
