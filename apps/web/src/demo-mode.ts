const demoBase = '/demo';

export function isPublicDemoPath(pathname: string): boolean {
  return pathname === demoBase || pathname.startsWith(`${demoBase}/`);
}

export function publicDemoRoute(pathname: string, search: string): string {
  const path = pathname.slice(demoBase.length) || '/';
  return `${path}${search}`;
}

export function publicDemoHref(route: string): string {
  return `${demoBase}${route}`;
}

export function publicDemoMode(): boolean {
  return isPublicDemoPath(location.pathname);
}

export function currentAppRoute(): string {
  return publicDemoMode() ? publicDemoRoute(location.pathname, location.search) : location.hash.slice(1) || '/';
}

export function appHref(route: string): string {
  return publicDemoMode() ? publicDemoHref(route) : `#${route}`;
}

export function navigateApp(route: string): void {
  if (publicDemoMode()) {
    history.pushState(null, '', publicDemoHref(route));
    dispatchEvent(new PopStateEvent('popstate'));
    return;
  }
  location.hash = route;
}
