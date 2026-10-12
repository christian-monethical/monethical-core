import type { PlanId } from '../../api/types';

/** Plan ids accepted by the staff endpoints, with their display names. Limits come from `/v1/me`. */
export const PLAN_OPTIONS: { value: PlanId; label: string }[] = [
  { value: 'FREE', label: 'Starter' },
  { value: 'PRO', label: 'Business' },
  { value: 'EMPIRE', label: 'Empire' },
];

export const planName = (id: string): string => PLAN_OPTIONS.find((p) => p.value === id)?.label ?? id;
