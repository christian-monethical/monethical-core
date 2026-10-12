import { api, body } from '../../api/client';
import { useQuery } from '../../api/hooks';
import { K } from '../../api/keys';
import type { Me } from '../../api/types';

const fetchMe = async (): Promise<Me> => body(await api.GET('/v1/me'));

/** Current account. `is_staff` here (not the id token) decides what the UI exposes. */
export const useMe = () => useQuery(K.me, fetchMe, 5 * 60_000);
