'use client';

import type { ReactNode } from 'react';
import { shortenHash } from '@/lib/format';

export function Panel({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col gap-4">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
        <span className="text-zinc-500 mr-2">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Button({
  onClick,
  disabled,
  children,
  variant = 'primary',
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const variants = {
    primary:
      'bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-zinc-700',
    secondary:
      'bg-zinc-700 hover:bg-zinc-600 text-zinc-100 disabled:bg-zinc-800',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white disabled:bg-zinc-700',
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-zinc-500 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-lg border border-rose-900 bg-rose-950/50 px-3 py-2 text-sm text-rose-300 break-words">
      {children}
    </p>
  );
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className="text-zinc-200 text-right">{children}</span>
    </div>
  );
}

export function TxLink({
  href,
  hash,
  label,
}: {
  href?: string;
  hash: string;
  label: string;
}) {
  const text = `${label}: ${shortenHash(hash)}`;
  if (!href) return <span className="text-xs text-zinc-400">{text}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-sky-400 hover:underline"
    >
      {text} ↗
    </a>
  );
}

export function Dot({ tone }: { tone: 'ok' | 'warn' | 'err' | 'idle' }) {
  const tones = {
    ok: 'bg-emerald-400',
    warn: 'bg-amber-400',
    err: 'bg-rose-400',
    idle: 'bg-zinc-600',
  } as const;
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${tones[tone]}`} />
  );
}
