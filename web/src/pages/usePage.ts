import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { previewQuery } from '@/app/preview';
import type { PageData } from '@/lib/types';

export function usePage(slug: string) {
  return useQuery({ queryKey: ['page', slug, previewQuery()], queryFn: () => get<PageData>(`/pages/${slug}`, previewQuery()) });
}
