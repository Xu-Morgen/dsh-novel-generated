import * as React from 'react';

/** I188 / design §14.34: native button contract, with presentation-only emphasis. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly [anchor: `data-${string}`]: string | undefined;
  readonly variant?: 'secondary' | 'primary' | 'ghost' | 'danger' | 'choice';
  readonly busy?: boolean;
  readonly busyLabel?: string;
  readonly disabledReason?: string;
}

/**
 * Keeps DOM anchors and native disabled semantics. Busy never invokes an action;
 * the adjacent reason is focus-independent and referenced by the button.
 * Domain confirmation and save/retry remain the caller's existing commands.
 */
export function Button({ variant = 'secondary', busy = false, busyLabel = '正在处理…', disabledReason,
  disabled, children, className = '', ...props }: ButtonProps): React.ReactElement {
  const reasonId = React.useId();
  const reason = busy ? busyLabel : disabled ? disabledReason : undefined;
  return React.createElement(React.Fragment, null,
    React.createElement('button', {
      ...props, type: props.type ?? 'button', disabled: disabled || busy,
      'aria-busy': busy || undefined,
      'aria-describedby': [props['aria-describedby'], reason ? reasonId : undefined].filter(Boolean).join(' ') || undefined,
      className: `nv-btn nv-btn--${variant} ${className}`.trim(),
    }, children),
    reason ? React.createElement('span', { id: reasonId, className: 'nv-control-reason', role: busy ? 'status' : undefined }, reason) : null,
  );
}
