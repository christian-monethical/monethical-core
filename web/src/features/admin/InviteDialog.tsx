import { useState } from 'preact/hooks';
import { isApiError } from '../../api/errors';
import { useMutation } from '../../api/hooks';
import { describeError } from '../../api/messages';
import type { Account, PlanId } from '../../api/types';
import { t } from '../../i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Select, TextInput } from '../../ui/Field';
import { isEmail } from '../design/rules';
import { PLAN_OPTIONS } from './plans';
import { inviteAccount } from './api';

export function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: (a: Account) => void }) {
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [plan, setPlan] = useState<PlanId>('FREE');
  const [attempted, setAttempted] = useState(false);
  const invite = useMutation(inviteAccount, { toastError: false, onSuccess: onInvited });

  const cleanEmail = email.trim().toLowerCase();
  const emailError = !cleanEmail ? t('rules.required') : !isEmail(cleanEmail) ? t('rules.email') : undefined;
  const serverError = isApiError(invite.error) ? invite.error : undefined;

  return (
    <Dialog
      open
      title={t('admin.invite')}
      onClose={onClose}
      dismissable={!invite.pending}
      footer={
        <>
          <Button onClick={onClose} disabled={invite.pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="invite" loading={invite.pending}>
            {t('admin.send_invite')}
          </Button>
        </>
      }
    >
      <form
        id="invite"
        class="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setAttempted(true);
          if (!emailError) void invite.run({ email: cleanEmail, company: company.trim(), plan });
        }}
      >
        <p class="muted">{t('admin.invite_hint')}</p>
        <TextInput label="Email" type="email" value={email} required data-autofocus error={attempted ? emailError : serverError?.fieldErrors.email} onInput={(e) => setEmail(e.currentTarget.value)} />
        <TextInput label={t('admin.company')} value={company} maxLength={120} error={serverError?.fieldErrors.company} onInput={(e) => setCompany(e.currentTarget.value)} />
        <Select<PlanId> label={t('admin.plan')} value={plan} options={PLAN_OPTIONS} onChange={setPlan} />
        {invite.error !== undefined && (
          <p class="field-error" role="alert">
            {describeError(invite.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}
