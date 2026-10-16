import { ExternalLink } from 'lucide-react';
import { dateTime } from '@/lib/format';
import { srcFor } from '@/lib/image';
import { CrudPage, type FieldSpec } from '../components/CrudPage';
import { StatusBadge } from '../components/ui';

interface BlogPost {
  id: string; slug: string; title: string; excerpt: string; coverImage: string; category: string; tags: string[]; authorName: string;
  status: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED'; publishedAt: string | null; updatedAt?: string;
}

const fields: FieldSpec[] = [
  { key: 'title', label: 'Title', type: 'text', span: 2 },
  { key: 'slug', label: 'URL slug', type: 'text', hint: 'Lowercase words separated by hyphens. The post lives at /journal/<slug>.', placeholder: 'a-weekend-in-the-hills' },
  { key: 'category', label: 'Category', type: 'text', placeholder: 'Journal' },
  { key: 'excerpt', label: 'Excerpt', type: 'textarea', hint: 'One or two sentences shown on the journal index and in link previews (max 400 characters).' },
  { key: 'coverImage', label: 'Cover image', type: 'image' },
  { key: 'body', label: 'Body', type: 'markdown', hint: 'Markdown: ## headings, **bold**, _italic_, [links](https://…), - lists, > quotes, ![alt](image-url).' },
  { key: 'authorName', label: 'Author', type: 'text' },
  { key: 'tags', label: 'Tags', type: 'tags', hint: 'One per line (max 12).' },
  {
    key: 'status', label: 'Status', type: 'select',
    options: [{ value: 'DRAFT', label: 'Draft — not visible' }, { value: 'PUBLISHED', label: 'Published' }, { value: 'SCHEDULED', label: 'Scheduled — publishes at the date below' }],
  },
  { key: 'publishedAt', label: 'Publish date', type: 'datetime', hint: 'Required for scheduled posts. Leave blank to use the moment it is published.' },
  { key: 'seoTitle', label: 'SEO title', type: 'text', hint: 'Optional, max 80 characters. Defaults to the post title.' },
  { key: 'seoDescription', label: 'SEO description', type: 'textarea', hint: 'Optional, max 300 characters. Defaults to the excerpt.' },
];

const defaults = {
  slug: '', title: '', excerpt: '', body: '', coverImage: '', category: 'Journal', tags: [], authorName: '', status: 'DRAFT', publishedAt: null, seoTitle: '', seoDescription: '',
};

export default function BlogPage() {
  return (
    <CrudPage<BlogPost>
      title="Journal"
      description="Stories, guides and news published on the website’s journal."
      endpoint="/blog"
      itemLabel="post"
      fields={fields}
      defaults={defaults}
      columns={[
        {
          key: 'title', label: 'Post',
          render: (r) => (
            <div className="flex items-center gap-3">
              <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md bg-zinc-100">{r.coverImage && <img src={srcFor(r.coverImage, 160)} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
              <div className="min-w-0">
                <p className="max-w-[360px] truncate font-medium text-zinc-900">{r.title}</p>
                <p className="max-w-[360px] truncate font-mono text-[11px] text-zinc-500">/journal/{r.slug}</p>
              </div>
            </div>
          ),
        },
        { key: 'category', label: 'Category', render: (r) => <span className="text-xs">{r.category || '—'}</span> },
        { key: 'authorName', label: 'Author', render: (r) => <span className="text-xs">{r.authorName || '—'}</span> },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'publishedAt', label: 'Publish date', render: (r) => <span className="whitespace-nowrap text-xs">{r.publishedAt ? dateTime(r.publishedAt) : '—'}</span> },
      ]}
      rowActions={(r) => (
        <a className="admin-btn-ghost !p-1.5" href={`/journal/${encodeURIComponent(r.slug)}?preview=1`} target="_blank" rel="noopener noreferrer" aria-label={`Preview “${r.title}” in a new tab`} title="Preview">
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    />
  );
}
