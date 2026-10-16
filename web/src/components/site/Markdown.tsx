import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

/** Safe markdown (raw HTML is never rendered). Internal links use the router. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('prose-luxe', className)}>
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ href = '', children: c }) =>
            href.startsWith('/') ? <Link to={href}>{c}</Link> : <a href={href} target="_blank" rel="noopener noreferrer">{c}</a>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
