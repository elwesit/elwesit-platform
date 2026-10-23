import { useEffect, useState } from 'react';

function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => { const f = () => setR(parse()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return r;
}
export const go = (path) => { location.hash = '#/' + path.replace(/^\//, ''); };
export const href = (path) => '#/' + path.replace(/^\//, '');
export const back = (fallback) => { if (history.length > 1) history.back(); else go(fallback || 'today'); };
