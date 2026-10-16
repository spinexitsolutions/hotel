import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { post, errorMessage } from '@/lib/api';
import { Seo } from '@/components/site/Seo';

export default function UnsubscribePage() {
  const [sp] = useSearchParams();
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    post('/newsletter/unsubscribe', { token: sp.get('token') }).then(() => setState('done')).catch((e) => { setState('error'); setMsg(errorMessage(e)); });
  }, [sp]);
  return (
    <section className="tone-surface flex min-h-[60vh] items-center py-24 text-center">
      <Seo title="Unsubscribe" noIndex />
      <div className="container-luxe max-w-xl">
        <h1 className="h-section">{state === 'done' ? 'You have been unsubscribed' : state === 'error' ? 'We could not process that link' : 'One moment…'}</h1>
        <p className="mt-5 text-muted">{state === 'done' ? 'You will no longer receive our newsletter. We hope to see you again.' : msg}</p>
        <Link to="/" className="btn btn-ghost mt-8">Return home</Link>
      </div>
    </section>
  );
}
