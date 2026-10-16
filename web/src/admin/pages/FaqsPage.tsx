import { CrudPage, type FieldSpec } from '../components/CrudPage';
import { Badge } from '../components/ui';

interface Faq { id: string; question: string; answer: string; category: string; sortOrder: number; isPublished: boolean }

const fields: FieldSpec[] = [
  { key: 'question', label: 'Question', type: 'text', span: 2, placeholder: 'What time is check-in?' },
  { key: 'answer', label: 'Answer', type: 'markdown', hint: 'Markdown supported: **bold**, [links](https://…), - lists.' },
  { key: 'category', label: 'Category', type: 'text', hint: 'Questions are grouped by category on the FAQ page, e.g. Stay, Dining, Payments.', placeholder: 'General' },
  { key: 'sortOrder', label: 'Sort order', type: 'number', hint: 'Lower numbers appear first within a category.' },
  { key: 'isPublished', label: 'Published', type: 'boolean', hint: 'Unpublished questions are hidden from the website.', span: 2 },
];

export default function FaqsPage() {
  return (
    <CrudPage<Faq>
      title="FAQs"
      description="Frequently asked questions shown on the website and used for FAQ rich results in search."
      endpoint="/faqs"
      itemLabel="question"
      fields={fields}
      defaults={{ question: '', answer: '', category: 'General', sortOrder: 0, isPublished: true }}
      columns={[
        { key: 'question', label: 'Question', render: (r) => <div className="max-w-xl"><p className="font-medium text-zinc-900">{r.question}</p><p className="line-clamp-1 text-xs text-zinc-500">{r.answer}</p></div> },
        { key: 'category', label: 'Category', render: (r) => <Badge>{r.category || 'General'}</Badge> },
        { key: 'sortOrder', label: 'Order', className: 'tabular-nums text-xs' },
        { key: 'isPublished', label: 'Status', render: (r) => (r.isPublished ? <Badge color="green">Published</Badge> : <Badge>Hidden</Badge>) },
      ]}
    />
  );
}
