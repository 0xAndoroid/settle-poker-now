import { useEffect, useState } from 'react';
import { parseRoute, type Route } from '@/lib/routing';

function readCurrent(): Route {
  if (typeof window === 'undefined') return { kind: 'home' };
  return parseRoute(window.location.pathname);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(readCurrent);

  useEffect(() => {
    const handler = () => setRoute(readCurrent());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  return route;
}
