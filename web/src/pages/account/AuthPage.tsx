import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { forgotPasswordSchema, loginSchema, registerSchema } from '@aurelle/shared';
import { ApiError, post } from '@/lib/api';
import { useAuth } from '@/app/AuthProvider';
import { Seo } from '@/components/site/Seo';
import { Field, Input } from '@/components/ui/Field';

type Mode = 'login' | 'register' | 'forgot';
const schemas = { login: loginSchema, register: registerSchema, forgot: forgotPasswordSchema };

export default function AuthPage({ mode }: { mode: Mode }) {
  const { login, register: signup } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get('next');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const form = useForm<Record<string, unknown>>({ resolver: zodResolver(schemas[mode] as z.ZodTypeAny), defaultValues: { email: '', password: '', name: '', phone: '', marketingOptIn: false } });
  const errs = form.formState.errors as Record<string, { message?: string } | undefined>;

  const onSubmit = form.handleSubmit(async (v) => {
    setError('');
    try {
      if (mode === 'login') {
        const u = await login(String(v.email), String(v.password));
        nav(next && next.startsWith('/') ? next : u.isStaff ? '/admin' : '/account');
      } else if (mode === 'register') {
        await signup(v as never);
        nav(next && next.startsWith('/') ? next : '/account');
      } else {
        const r = await post<{ message: string }>('/auth/forgot-password', { email: v.email });
        setDone(r.message);
      }
    } catch (e) {
      if (e instanceof ApiError && e.fields) for (const [k, m] of Object.entries(e.fields)) form.setError(k, { message: m });
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  });

  const title = mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset your password';
  return (
    <section className="tone-surface flex min-h-[80vh] items-center py-20">
      <Seo title={mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Forgot password'} noIndex />
      <div className="container-luxe max-w-md">
        <p className="eyebrow text-center">{mode === 'register' ? 'Join us' : 'Your account'}</p>
        <h1 className="h-section mt-4 text-center">{title}</h1>
        {mode === 'register' && <p className="mt-4 text-center text-sm text-muted">Manage reservations, save favourite suites and book faster.</p>}
        <form onSubmit={onSubmit} noValidate className="card-luxe mt-10 space-y-5 p-8">
          {done ? <p className="text-sm" role="status">{done}</p> : (
            <>
              {mode === 'register' && <Field label="Full name" error={errs.name?.message}>{(p) => <Input {...p} autoComplete="name" {...form.register('name')} />}</Field>}
              <Field label="Email" error={errs.email?.message}>{(p) => <Input {...p} type="email" autoComplete="email" {...form.register('email')} />}</Field>
              {mode === 'register' && <Field label="Mobile (optional)" error={errs.phone?.message}>{(p) => <Input {...p} type="tel" autoComplete="tel" {...form.register('phone')} />}</Field>}
              {mode !== 'forgot' && <Field label="Password" error={errs.password?.message} hint={mode === 'register' ? 'At least 10 characters with upper and lower case letters and a number.' : undefined}>{(p) => <Input {...p} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} {...form.register('password')} />}</Field>}
              {mode === 'register' && <label className="flex items-start gap-3 text-sm text-muted"><input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--c-primary))]" {...form.register('marketingOptIn')} /> Send me occasional offers and news.</label>}
              {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
              <button className="btn btn-primary w-full" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}</button>
            </>
          )}
          <div className="flex justify-between text-xs text-muted">
            {mode === 'login' ? <><Link to="/forgot-password" className="underline-offset-4 hover:underline">Forgot password?</Link><Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="underline-offset-4 hover:underline">Create an account</Link></> : <Link to="/login" className="underline-offset-4 hover:underline">Back to sign in</Link>}
          </div>
        </form>
      </div>
    </section>
  );
}
