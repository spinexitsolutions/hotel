import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Copy, KeyRound, Lock, Pencil, Plus, RefreshCw, Save, ShieldCheck, Undo2 } from 'lucide-react';
import { PERMISSIONS, ROLE_LABELS, STAFF_ROLE_KEYS, type Permission, type RoleKey } from '@aurelle/shared';
import { ApiError, errorMessage, get, post, put } from '@/lib/api';
import { dateTime, relTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuth } from '@/app/AuthProvider';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { Badge, Card, Empty, ErrorBox, Labeled, Loading, PageHeader, SearchBox, Toggle } from '../components/ui';

interface StaffRow { id: string; name: string; email: string; phone: string; roleKey: string; roleName: string; isActive: boolean; lastLoginAt: string | null; createdAt: string; lockedUntil: string | null }
interface RoleRow { id: string; key: string; name: string; description: string; permissions: string[]; users: number }

const PASSWORD_HINT = 'At least 10 characters, with upper- and lower-case letters and a number.';
const passwordProblem = (p: string) => (p.length < 10 ? 'Use at least 10 characters' : !(/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)) ? 'Include upper and lower case letters and a number' : null);

/** Cryptographically random password that always satisfies the policy. */
function generatePassword(len = 16) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*-_+='];
  const all = sets.join('');
  const rnd = (n: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const chars = sets.map((s) => s[rnd(s.length)]);
  while (chars.length < len) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

const roleLabel = (k: string) => ROLE_LABELS[k as RoleKey] ?? k;
const ROLE_COLOR: Record<string, 'violet' | 'amber' | 'blue' | 'green' | 'zinc'> = { SUPER_ADMIN: 'violet', HOTEL_MANAGER: 'amber', BOOKING_MANAGER: 'blue', RECEPTIONIST: 'green', CONTENT_EDITOR: 'zinc' };

export default function StaffPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'roles' ? 'roles' : 'staff';
  return (
    <div>
      <PageHeader title="Staff & roles" description="Manage who can access the admin and what each role is allowed to do." />
      <div role="tablist" aria-label="Staff sections" className="mb-5 inline-flex gap-1 border-b border-zinc-200">
        {(['staff', 'roles'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setParams(t === 'staff' ? {} : { tab: t }, { replace: true })}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800')}>
            {t === 'staff' ? 'Staff accounts' : 'Roles & permissions'}
          </button>
        ))}
      </div>
      {tab === 'staff' ? <StaffTab /> : <RolesTab />}
    </div>
  );
}

// ─── Password input with generator ───────────────────────────────────────────
function PasswordField({ id, value, onChange, error, label = 'Password' }: { id: string; value: string; onChange: (v: string) => void; error?: string; label?: string }) {
  const [generated, setGenerated] = useState<string | null>(null);
  const toast = useToast();
  return (
    <Labeled label={label} htmlFor={id} error={error} hint={PASSWORD_HINT}>
      <div className="flex gap-2">
        <input id={id} type={generated ? 'text' : 'password'} autoComplete="new-password" className="admin-input font-mono" value={value}
          onChange={(e) => { setGenerated(null); onChange(e.target.value); }} />
        <button type="button" className="admin-btn-secondary shrink-0" onClick={() => { const p = generatePassword(); onChange(p); setGenerated(p); }}>
          <RefreshCw className="h-4 w-4" /> Generate
        </button>
      </div>
      {generated && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
          <p className="font-medium">Generated password — copy it now, it will not be shown again:</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="select-all rounded bg-white px-2 py-1 font-mono text-sm text-zinc-900 ring-1 ring-amber-200">{generated}</code>
            <button type="button" className="admin-btn-ghost !p-1.5" aria-label="Copy password" onClick={async () => { try { await navigator.clipboard.writeText(generated); toast.success('Password copied'); } catch { toast.error('Copy failed — select and copy manually'); } }}>
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-amber-800">Share it with the staff member through a secure channel and ask them to change it after signing in.</p>
        </div>
      )}
    </Labeled>
  );
}

// ─── Staff tab ───────────────────────────────────────────────────────────────
type StaffForm = { id?: string; name: string; email: string; phone: string; roleKey: string; isActive: boolean; password: string };

function StaffTab() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<StaffForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reset, setReset] = useState<StaffRow | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'staff'], queryFn: () => get<{ items: StaffRow[] }>('/admin/staff') });

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.items ?? []).filter((u) => !s || `${u.name} ${u.email} ${u.roleName}`.toLowerCase().includes(s));
  }, [data, q]);

  const save = useMutation({
    mutationFn: (f: StaffForm) => (f.id
      ? put(`/admin/staff/${f.id}`, { name: f.name, phone: f.phone, roleKey: f.roleKey, isActive: f.isActive })
      : post('/admin/staff', { name: f.name, email: f.email, phone: f.phone, roleKey: f.roleKey, password: f.password })),
    onSuccess: (_r, f) => { toast.success(f.id ? 'Staff member updated' : 'Staff account created'); setForm(null); void qc.invalidateQueries({ queryKey: ['admin', 'staff'] }); void qc.invalidateQueries({ queryKey: ['admin', 'roles'] }); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); toast.error(errorMessage(e)); },
  });

  const open = (f: StaffForm) => { setErrors({}); setForm(f); };
  const set = <K extends keyof StaffForm>(k: K, v: StaffForm[K]) => setForm((s) => (s ? { ...s, [k]: v } : s));
  const submit = () => {
    if (!form) return;
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.id && !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.id) { const p = passwordProblem(form.password); if (p) errs.password = p; }
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate(form);
  };
  const editingSelf = form?.id === user?.id;

  return (
    <>
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-3">
          <SearchBox value={q} onChange={setQ} placeholder="Search staff…" />
          <button className="admin-btn-primary" onClick={() => open({ name: '', email: '', phone: '', roleKey: 'RECEPTIONIST', isActive: true, password: '' })}><Plus className="h-4 w-4" /> Add staff member</button>
        </div>
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={() => refetch()} /></div> : !items.length ? (
          <Empty title={q ? 'No staff match your search' : 'No staff yet'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Added</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {items.map((u) => {
                  const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                  return (
                    <tr key={u.id}>
                      <td>
                        <p className="font-medium text-zinc-900">{u.name}{u.id === user?.id && <span className="ml-1.5 text-xs font-normal text-zinc-400">(you)</span>}</p>
                        <p className="text-xs text-zinc-500">{u.email}{u.phone && ` · ${u.phone}`}</p>
                      </td>
                      <td><Badge color={ROLE_COLOR[u.roleKey] ?? 'zinc'}>{u.roleName || roleLabel(u.roleKey)}</Badge></td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {u.isActive ? <Badge color="green">Active</Badge> : <Badge color="zinc">Deactivated</Badge>}
                          {locked && <Badge color="red"><Lock className="mr-1 h-3 w-3" />Locked</Badge>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-xs text-zinc-600" title={u.lastLoginAt ? dateTime(u.lastLoginAt) : undefined}>{u.lastLoginAt ? relTime(u.lastLoginAt) : 'Never'}</td>
                      <td className="whitespace-nowrap text-xs text-zinc-600">{dateTime(u.createdAt)}</td>
                      <td className="whitespace-nowrap text-right">
                        <button className="admin-btn-ghost !p-1.5" aria-label={`Reset password for ${u.name}`} title="Reset password" onClick={() => setReset(u)}><KeyRound className="h-4 w-4" /></button>
                        <button className="admin-btn-ghost !p-1.5" aria-label={`Edit ${u.name}`} title="Edit" onClick={() => open({ id: u.id, name: u.name, email: u.email, phone: u.phone ?? '', roleKey: u.roleKey, isActive: u.isActive, password: '' })}><Pencil className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-zinc-500">Changing a role or deactivating an account signs that person out of all sessions immediately. Accounts are locked temporarily after repeated failed sign-ins; resetting the password unlocks them.</p>

      {form && (
        <Dialog open onOpenChange={(o) => !o && setForm(null)} title={form.id ? 'Edit staff member' : 'Add staff member'} description={form.id ? form.email : 'They can sign in at /admin with this email and password.'}
          footer={<><button className="admin-btn-secondary" onClick={() => setForm(null)}>Cancel</button><button className="admin-btn-primary" disabled={save.isPending} onClick={submit}>{save.isPending ? 'Saving…' : form.id ? 'Save changes' : 'Create account'}</button></>}>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Labeled label="Full name" htmlFor="st-name" error={errors.name}><input id="st-name" className="admin-input" value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" /></Labeled>
            {!form.id && <Labeled label="Email" htmlFor="st-email" error={errors.email}><input id="st-email" type="email" className="admin-input" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" /></Labeled>}
            <Labeled label="Phone (optional)" htmlFor="st-phone" error={errors.phone}><input id="st-phone" type="tel" className="admin-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" /></Labeled>
            <Labeled label="Role" htmlFor="st-role" error={errors.roleKey} hint={editingSelf ? 'You cannot change your own role.' : undefined}>
              <select id="st-role" className="admin-input" value={form.roleKey} disabled={editingSelf} onChange={(e) => set('roleKey', e.target.value)}>
                {STAFF_ROLE_KEYS.map((k) => <option key={k} value={k}>{ROLE_LABELS[k]}</option>)}
              </select>
            </Labeled>
            {form.id ? (
              <div className="rounded-lg border border-zinc-200 p-3">
                <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} disabled={editingSelf} label="Account active" description={editingSelf ? 'You cannot deactivate yourself.' : 'Deactivated staff cannot sign in.'} />
              </div>
            ) : (
              <PasswordField id="st-pw" value={form.password} onChange={(v) => set('password', v)} error={errors.password} label="Initial password" />
            )}
            <button type="submit" className="hidden" />
          </form>
        </Dialog>
      )}
      {reset && <ResetPasswordDialog user={reset} onClose={() => setReset(null)} />}
    </>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: StaffRow; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string>();
  const m = useMutation({
    mutationFn: () => post(`/admin/staff/${user.id}/reset-password`, { password: pw }),
    onSuccess: () => { toast.success(`Password reset for ${user.name}`); void qc.invalidateQueries({ queryKey: ['admin', 'staff'] }); onClose(); },
    onError: (e) => { setErr(errorMessage(e)); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Reset password`} description={`${user.name} (${user.email}) will be signed out everywhere and any lockout is cleared.`}
      footer={<><button className="admin-btn-secondary" onClick={onClose}>Cancel</button><button className="admin-btn-primary" disabled={m.isPending} onClick={() => { const p = passwordProblem(pw); if (p) setErr(p); else m.mutate(); }}>{m.isPending ? 'Resetting…' : 'Reset password'}</button></>}>
      <PasswordField id="rp-pw" value={pw} onChange={(v) => { setPw(v); setErr(undefined); }} error={err} label="New password" />
    </Dialog>
  );
}

// ─── Roles tab ───────────────────────────────────────────────────────────────
const LOCKED_ROLES = ['SUPER_ADMIN', 'CUSTOMER'];
const ROLE_ORDER = ['SUPER_ADMIN', 'HOTEL_MANAGER', 'BOOKING_MANAGER', 'RECEPTIONIST', 'CONTENT_EDITOR', 'CUSTOMER'];

function RolesTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => get<{ items: RoleRow[]; allPermissions: string[] }>('/admin/roles') });
  const [draft, setDraft] = useState<Record<string, string[]>>({});

  useEffect(() => { if (data) setDraft(Object.fromEntries(data.items.map((r) => [r.key, [...r.permissions]]))); }, [data]);

  const roles = useMemo(() => (data?.items ?? []).filter((r) => r.key !== 'CUSTOMER').sort((a, b) => ROLE_ORDER.indexOf(a.key) - ROLE_ORDER.indexOf(b.key)), [data]);
  const perms = (data?.allPermissions ?? Object.keys(PERMISSIONS)) as Permission[];
  const groups = useMemo(() => {
    const g = new Map<string, Permission[]>();
    for (const p of perms) { const k = p.split('.')[0]; g.set(k, [...(g.get(k) ?? []), p]); }
    return [...g.entries()];
  }, [perms]);

  const dirty = (key: string) => {
    const orig = data?.items.find((r) => r.key === key)?.permissions ?? [];
    const cur = draft[key] ?? [];
    return orig.length !== cur.length || orig.some((p) => !cur.includes(p));
  };
  const has = (key: string, p: string) => key === 'SUPER_ADMIN' || (draft[key] ?? []).includes(p);
  const toggle = (key: string, p: string) => setDraft((d) => ({ ...d, [key]: (d[key] ?? []).includes(p) ? d[key].filter((x) => x !== p) : [...(d[key] ?? []), p] }));

  const save = useMutation({
    mutationFn: (key: string) => put(`/admin/roles/${key}`, { permissions: draft[key] ?? [] }),
    onSuccess: (_r, key) => { toast.success(`${roleLabel(key)} permissions saved`); void qc.invalidateQueries({ queryKey: ['admin', 'roles'] }); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <Card><Loading /></Card>;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  const anyDirty = roles.some((r) => dirty(r.key));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Permission changes apply <strong>immediately</strong> to every staff member with that role, on their next request. Super Admin always has every permission and cannot be edited; customer accounts never have admin access.</p>
      </div>
      <Card bodyClassName="p-0">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Permissions matrix: rows are permissions, columns are roles</caption>
            <thead className="sticky top-0 z-10 bg-white">
              <tr>
                <th scope="col" className="sticky left-0 z-20 min-w-[260px] border-b border-zinc-200 bg-white px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">Permission</th>
                {roles.map((r) => (
                  <th key={r.key} scope="col" className="min-w-[132px] border-b border-zinc-200 px-3 py-3 text-center align-bottom">
                    <p className="text-sm font-semibold text-zinc-900">{r.name || roleLabel(r.key)}</p>
                    <p className="text-[11px] font-normal text-zinc-500">{r.users} {r.users === 1 ? 'user' : 'users'}</p>
                    {LOCKED_ROLES.includes(r.key) ? (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-normal text-zinc-500"><ShieldCheck className="h-3.5 w-3.5" /> All, fixed</p>
                    ) : (
                      <div className="mt-1.5 flex justify-center gap-1">
                        <button className="admin-btn-primary !px-2 !py-1 text-[11px]" disabled={!dirty(r.key) || save.isPending} onClick={() => save.mutate(r.key)} aria-label={`Save ${r.name} permissions`}><Save className="h-3 w-3" /> Save</button>
                        {dirty(r.key) && <button className="admin-btn-ghost !px-1.5 !py-1" onClick={() => setDraft((d) => ({ ...d, [r.key]: [...(data!.items.find((x) => x.key === r.key)?.permissions ?? [])] }))} aria-label={`Discard ${r.name} changes`} title="Discard changes"><Undo2 className="h-3 w-3" /></button>}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, ps]) => (
                <Fragment key={group}>
                  <tr><th colSpan={roles.length + 1} scope="colgroup" className="sticky left-0 border-b border-zinc-100 bg-zinc-50 px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{group}</th></tr>
                  {ps.map((p) => (
                    <tr key={p} className="hover:bg-zinc-50/70">
                      <th scope="row" className="sticky left-0 border-b border-zinc-100 bg-white px-4 py-2 text-left font-normal">
                        <p className="font-mono text-xs text-zinc-900">{p}</p>
                        <p className="text-xs text-zinc-500">{PERMISSIONS[p] ?? ''}</p>
                      </th>
                      {roles.map((r) => {
                        const locked = LOCKED_ROLES.includes(r.key);
                        return (
                          <td key={r.key} className="border-b border-zinc-100 px-3 py-2 text-center">
                            <input type="checkbox" className="h-4 w-4 cursor-pointer rounded border-zinc-300 accent-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                              checked={has(r.key, p)} disabled={locked} onChange={() => toggle(r.key, p)} aria-label={`${r.name}: ${p}`} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {anyDirty && <p className="text-xs text-amber-700" role="status">You have unsaved changes. Save each role you changed.</p>}
    </div>
  );
}
