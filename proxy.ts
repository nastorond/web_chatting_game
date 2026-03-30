import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default async function proxy(request: NextRequest) {
  const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE === 'true';
  const { pathname } = request.nextUrl;

  // 1. If maintenance mode is ON
  if (isMaintenanceMode) {
    // Redirect to /maintenance if not already there and not a static file/api
    if (pathname !== '/maintenance') {
      return NextResponse.redirect(new URL('/maintenance', request.url));
    }
  }

  // 2. If maintenance mode is OFF
  if (!isMaintenanceMode) {
    // If user tries to access /maintenance manually, redirect to home
    if (pathname === '/maintenance') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
