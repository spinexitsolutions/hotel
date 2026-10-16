import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { password as passwordSchema } from '@aurelle/shared';
import { post, errorMessage } from '@/lib/api';
import { Seo } from '@/components/site/Seo';
import { Field, Input } from '@/components/ui/Field';

export default function ResetPasswordPage() {
  const [sp] = useSearchParams();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const submit = async () => {
    const v = passwordSchema.safeParse(pw);
    if (!v.success) return setErr(v.error.issues[0].message);
    try {
      await post('/auth/reset-password', { token: sp.get('token'), password: pw });
      setDone(true);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <section className="tone-surface flex min-h-[70vh] items-center py-20">
      <Seo title="Choose a new password" noIndex />
      <div className="container-luxe max-w-md">
        <h1 className="h-section text-center">Choose a new password</h1>
        <form className="card-luxe mt-10 space-y-5 p-8" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {done ? <p role="status">Your password has been updated. <Link to="/login" className="underline">Sign in</Link></p> : (
            <>
              <Field label="New password" error={err}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
              <button className="btn btn-primary w-full">Update password</button>
            </>
          )}
        </form>
      </div>
    </section>
  );
}
