import type { ReactNode } from 'react';
import { Icon } from './icon';

/** The split hero + glass card used by sign-in and sign-up. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="auth">
      <div className="auth-hero">
        <div className="brand" style={{ marginBottom: 34 }}>
          <div className="logo">H</div>HRMS Workspace
        </div>
        <p className="eyebrow">Payroll · Attendance · People</p>
        <h1>
          The HR workspace your team <span>opens every morning</span>
        </h1>
        <p>
          Compliance-ready Indian payroll, attendance with biometrics, and a daily hub for every
          employee. Customise it in a few clicks.
        </p>
        <div className="auth-points">
          <div>
            <b>
              <Icon name="shield" size={14} />
            </b>
            Every company&apos;s data kept separate, visible only to people you allow
          </div>
          <div>
            <b>
              <Icon name="sliders" size={14} />
            </b>
            Roles, fields and approvals set up without code
          </div>
          <div>
            <b>
              <Icon name="spark" size={14} />
            </b>
            AI assistant that only knows your company
          </div>
        </div>
      </div>
      <div className="glass-card" style={{ position: 'relative' }}>
        <h2>{title}</h2>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          {subtitle}
        </p>
        {children}
      </div>
    </section>
  );
}

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <div className="err" id={`${id}-err`}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
