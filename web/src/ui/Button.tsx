import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'type'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: IconName;
  loading?: boolean;
  type?: 'button' | 'submit';
  children?: ComponentChildren;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  type = 'button',
  class: cls,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      class={`btn btn-${variant} btn-${size}${loading ? ' is-loading' : ''}${cls ? ` ${String(cls)}` : ''}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  );
}

/** Icon-only button; `label` is the accessible name (and tooltip). */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  class: cls,
  ...rest
}: Omit<ButtonProps, 'children' | 'icon'> & { icon: IconName; label: string }) {
  return (
    <Button {...rest} variant={variant} size="sm" class={`btn-icon${cls ? ` ${String(cls)}` : ''}`} aria-label={label} title={label}>
      <Icon name={icon} size={16} />
    </Button>
  );
}
