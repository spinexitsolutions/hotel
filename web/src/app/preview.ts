/** Draft preview mode for staff: enabled with ?preview=1, remembered for the tab session. */
export function isPreview(): boolean {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('preview') === '1') sessionStorage.setItem('aur_preview', '1');
    if (qs.get('preview') === '0') sessionStorage.removeItem('aur_preview');
    return sessionStorage.getItem('aur_preview') === '1';
  } catch {
    return false;
  }
}

export function exitPreview() {
  try {
    sessionStorage.removeItem('aur_preview');
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('preview');
  window.location.href = url.toString();
}

export const previewQuery = () => (isPreview() ? { preview: 1 } : undefined);
