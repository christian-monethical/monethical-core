import { t } from '../i18n';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger = true, pending, onConfirm, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      title={title}
      size="sm"
      onClose={onCancel}
      dismissable={!pending}
      footer={
        <>
          <Button onClick={onCancel} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={pending} onClick={onConfirm} data-autofocus>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <p>{message}</p>
    </Dialog>
  );
}
