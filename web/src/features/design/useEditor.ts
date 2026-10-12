import { useMemo, useState } from 'preact/hooks';
import { isApiError } from '../../api/errors';
import { describeError } from '../../api/messages';
import { t } from '../../i18n';
import { toast, toastSuccess } from '../../ui/toast';
import { useDraft } from '../../ui/useUnsaved';
import type { Draft } from '../../ui/useUnsaved';
import type { Errors } from './rules';

interface Options<C extends object, R> {
  initial: C;
  /** Client-side mirror of the server rules. */
  validate: (config: C) => Errors;
  save: (config: C) => Promise<R>;
  /** Server record -> editable config (drops ids, versions and timestamps the PUT schema forbids). */
  fromStored: (stored: R) => C;
  onSaved?: (stored: R) => void;
}

export interface Editor<C extends object> {
  draft: Draft<C>;
  /** Client validation (after the first save attempt) merged with the server's `details`. */
  errors: Errors;
  saving: boolean;
  save: () => Promise<void>;
}

/**
 * Shared behaviour of every design editor: draft + dirty guard, explicit save, validation,
 * server error mapping. Saving never happens automatically.
 */
export function useEditor<C extends object, R>({ initial, validate, save, fromStored, onSaved }: Options<C, R>): Editor<C> {
  const draft = useDraft(initial);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const clientErrors = useMemo(() => validate(draft.value), [draft.value, validate]);

  async function run(): Promise<void> {
    setAttempted(true);
    if (Object.keys(clientErrors).length > 0) {
      toast('error', t('common.fix_errors'));
      return;
    }
    setServerErrors({});
    setSaving(true);
    try {
      const stored = await save(draft.value);
      draft.commit(fromStored(stored));
      setAttempted(false);
      toastSuccess(t('common.saved_toast'));
      onSaved?.(stored);
    } catch (e) {
      if (isApiError(e)) setServerErrors(e.fieldErrors);
      toast('error', describeError(e));
    } finally {
      setSaving(false);
    }
  }

  return {
    draft,
    errors: { ...(attempted ? clientErrors : {}), ...serverErrors },
    saving,
    save: run,
  };
}
