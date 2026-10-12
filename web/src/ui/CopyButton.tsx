import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { Button } from './Button';
import { toast } from './toast';

interface Props {
  text: string;
  label?: string;
  size?: 'sm' | 'md';
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label, size = 'sm' }: Props) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (): Promise<void> => {
    if (await copyToClipboard(text)) {
      setDone(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1800);
    } else {
      toast('error', t('common.copy_failed'));
    }
  };
  return (
    <Button size={size} icon={done ? 'check' : 'copy'} onClick={() => void copy()}>
      <span aria-live="polite">{done ? t('common.copied') : (label ?? t('common.copy'))}</span>
    </Button>
  );
}
