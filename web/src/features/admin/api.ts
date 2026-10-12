import { api, body } from '../../api/client';
import type { Account, Page, PlanId } from '../../api/types';

export const listAccounts = async (cursor: string | undefined): Promise<Page<Account>> =>
  body(await api.GET('/v1/admin/accounts', { params: { query: { limit: 50, cursor } } }));

export const inviteAccount = async (payload: { email: string; company: string; plan: PlanId }): Promise<Account> =>
  body(await api.POST('/v1/admin/accounts', { body: payload }));

export const updateAccount = async (
  tenantId: string,
  patch: { plan?: PlanId; status?: Account['status']; company?: string },
): Promise<Account> =>
  body(await api.PATCH('/v1/admin/accounts/{tenant_id}', { params: { path: { tenant_id: tenantId } }, body: patch }));
