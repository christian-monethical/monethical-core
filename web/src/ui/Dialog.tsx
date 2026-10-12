import { useEffect, useId, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { t } from '../i18n';
import { IconButton } from './Button';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  size?: 'sm' | 'md' | 'lg';
  /** Disable Esc/backdrop closing (e.g. while saving). */
  dismissable?: boolean;
}

/**
 * Modal dialog: focus moves in, Tab/Shift+Tab are trapped, Esc closes, focus returns to the trigger.
 * Mark an element with `data-autofocus` to choose the initially focused control.
 */
export function Dialog({ open, ...rest }: Props) {
  return open ? <DialogBody {...rest} /> : null;
}

function DialogBody({ title, onClose, children, footer, size = 'md', dismissable = true }: Omit<Props, 'open'>) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const first =
      root?.querySelector<HTMLElement>('[data-autofocus]') ??
      root?.querySelector('.dialog-body')?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root)?.focus();
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
      previous?.focus?.();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && dismissable) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    if (!firstEl || !lastEl) {
      e.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey && (active === firstEl || active === ref.current)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  return (
    <div
      class="overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose();
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the dialog owns Esc and the Tab focus trap */}
      <div
        ref={ref}
        class={`dialog dialog-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header class="dialog-head">
          <h2 id={titleId}>{title}</h2>
          {dismissable && <IconButton icon="x" label={t('common.close')} onClick={onClose} />}
        </header>
        <div class="dialog-body">{children}</div>
        {footer && <footer class="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}
