import { Link } from 'react-router-dom';
import { Seo } from '@/components/site/Seo';

export default function NotFoundPage() {
  return (
    <section className="tone-surface flex min-h-[70vh] items-center py-24 text-center">
      <Seo title="Page not found" noIndex />
      <div className="container-luxe max-w-2xl">
        <p className="eyebrow mb-6">404</p>
        <h1 className="h-display">This corridor leads nowhere</h1>
        <p className="mx-auto mt-6 max-w-md text-muted">The page you were looking for may have moved. Let us guide you back.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/" className="btn btn-primary">Return home</Link>
          <Link to="/rooms" className="btn btn-ghost">Rooms & suites</Link>
          <Link to="/contact" className="btn btn-ghost">Contact us</Link>
        </div>
      </div>
    </section>
  );
}
