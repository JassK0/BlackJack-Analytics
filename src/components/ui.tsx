// Small form primitives shared by the panels
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Segmented<T extends string | number>({ options, value, onChange, label, size }: {
  options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string; size?: 'small';
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const n = (Math.max(0, idx) + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div className={`seg${size ? ' ' + size : ''}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o, i) => (
        <button key={String(o.value)} ref={(el) => { refs.current[i] = el; }} type="button" role="radio"
          aria-checked={o.value === value} tabIndex={o.value === value || (idx < 0 && i === 0) ? 0 : -1}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`switch${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" />
      {children}
    </label>
  );
}

/** Number input that accepts free typing, commits valid values, and clamps on blur. */
export function NumberField({ value, onChange, min, max, step = 1, id, placeholder, allowEmpty, disabled, ariaLabel, integer = true }: {
  value: number | null; onChange: (v: number | null) => void; min: number; max: number; step?: number; id?: string;
  placeholder?: string; allowEmpty?: boolean; disabled?: boolean; ariaLabel?: string; integer?: boolean;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value == null ? '' : String(value)); }, [value]);
  const parse = (t: string) => {
    if (t.trim() === '') return allowEmpty ? null : undefined;
    const n = Number(t);
    if (!Number.isFinite(n)) return undefined;
    return integer ? Math.round(n) : n;
  };
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <input id={id} type="number" inputMode="decimal" value={text} min={min} max={max} step={step} placeholder={placeholder}
      disabled={disabled} aria-label={ariaLabel}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        if (n === null) onChange(null);
        else if (n !== undefined && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        focused.current = false;
        const n = parse(text);
        if (n === null) { onChange(null); setText(''); return; }
        const v = n === undefined ? (value ?? min) : clamp(n);
        onChange(v);
        setText(String(v));
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

export function Field({ label, children, help, output, htmlFor }: { label: ReactNode; children: ReactNode; help?: ReactNode; output?: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>{label}{output != null && <output>{output}</output>}</label>
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  );
}


export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('input, button, select')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <footer className="modal-foot">{footer}</footer>
      </div>
    </div>
  );
}

export function StrategyKey({ slot }: { slot: number }) {
  return <i className="key rect" style={{ background: `var(--s${slot})` }} aria-hidden="true" />;
}
