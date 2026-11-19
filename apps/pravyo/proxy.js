import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { teacherRedirectForSchoolPath } from './lib/teacherAreaRoutes.js';
import { dashboardHrefForPublicPath, isPublicPagePath } from './lib/dashboardLinks.js';

const DASHBOARD_BY_ROLE = {
    SUPER_ADMIN: '/admin/dashboard',
    SCHOOL_ADMIN: '/school/dashboard',
    TEACHER: '/teacher/dashboard',
    STUDENT: '/student/dashboard',
    PARENT: '/parent',
};

// Parent Access Card entry points. A guardian reaches these holding a printed
// card with no session at all, so they must be publicly routable — the card's
// own credentials are the authentication (see lib/parentCredentials.js).
const PARENT_PUBLIC_PATHS = new Set([
    '/parent/login',
    '/parent/register',
    '/parent/access',
    '/parent/activate',
]);

export default withAuth(
    function proxy(req) {
        const { pathname } = req.nextUrl;
        const { token } = req.nextauth;

        // Redirect authenticated users before rendering the public homepage.
        // This keeps `/` cacheable and avoids a session-backed DB lookup.
        if (pathname === '/' && token?.role && !token?.error) {
            const destination = DASHBOARD_BY_ROLE[token.role];
            if (destination) {
                return NextResponse.redirect(new URL(destination, req.url));
            }
        }

        // Signed-in people never see the public site: a public page reached
        // any way (typed, bookmarked, an old notification) opens the same
        // service inside their own dashboard (lib/dashboardLinks.js).
        // Certificates and /verify are documents and are not matched here.
        if (token?.role && !token?.error && isPublicPagePath(pathname)) {
            const destination = dashboardHrefForPublicPath(pathname, { role: token.role, userId: token.id });
            if (destination) {
                return NextResponse.redirect(new URL(destination, req.url));
            }
        }

        // Parent gates run FIRST. The staff gates below bounce "not my role" to
        // another staff dashboard (e.g. /admin sends non-admins to
        // /school/dashboard), which would trap a parent in a redirect toward an
        // area they can never enter. Resolving PARENT up front avoids that.
        if (token?.role === 'PARENT') {
            if (
                pathname.startsWith('/admin') ||
                pathname.startsWith('/school') ||
                pathname.startsWith('/teacher') ||
                pathname.startsWith('/student')
            ) {
                return NextResponse.redirect(new URL('/parent', req.url));
            }
        } else if (pathname.startsWith('/parent') && !PARENT_PUBLIC_PATHS.has(pathname)) {
            // Everyone else is kept out of the Parent App. Staff go to their own
            // dashboard so a mistyped URL does not look like a session failure.
            const destination = DASHBOARD_BY_ROLE[token?.role];
            if (destination) return NextResponse.redirect(new URL(destination, req.url));
            return NextResponse.redirect(new URL('/parent/login', req.url));
        }

        // A teacher at several schools signs in without a school and must pick
        // one before any school-scoped page loads.
        if (
            token?.role === 'TEACHER' &&
            !token?.schoolId &&
            (pathname.startsWith('/teacher') || pathname.startsWith('/school')) &&
            pathname !== '/teacher/select-school'
        ) {
            return NextResponse.redirect(new URL('/teacher/select-school', req.url));
        }

        // Protect Admin Routes
        if (pathname.startsWith('/admin') && token?.role !== 'SUPER_ADMIN') {
            return NextResponse.redirect(new URL('/school/dashboard', req.url));
        }

        // Protect School Routes (Teachers & Admins)
        if (pathname.startsWith('/school')) {
            if (token?.role !== 'SCHOOL_ADMIN' && token?.role !== 'TEACHER') {
                if (token?.role === 'SUPER_ADMIN') return NextResponse.redirect(new URL('/admin/dashboard', req.url));
                // If Student tries to access school/teacher admin area, redirect to student dashboard
                if (token?.role === 'STUDENT') return NextResponse.redirect(new URL('/student/dashboard', req.url));
                return NextResponse.redirect(new URL('/login', req.url));
            }
            if (token?.role === 'SCHOOL_ADMIN' && token?.status === 'UNSUBSCRIBED' && !pathname.startsWith('/school/suspended')) {
                return NextResponse.redirect(new URL('/school/suspended', req.url));
            }
            // The /school area is the school admin's. Teachers work in their
            // own area (/teacher/dashboard, /teacher/exams/...), apart from the
            // few shared pages listed in lib/teacherAreaRoutes.js.
            if (token?.role === 'TEACHER') {
                const destination = teacherRedirectForSchoolPath(pathname);
                if (destination) return NextResponse.redirect(new URL(destination, req.url));
            }
        }

        // Protect Teacher Routes (LMS Content Creation)
        if (pathname.startsWith('/teacher')) {
            if (token?.role !== 'TEACHER' && token?.role !== 'SCHOOL_ADMIN') {
                return NextResponse.redirect(new URL('/login', req.url));
            }
            // The teacher's exam workspace is for teachers only; the school
            // enters and manages marks in its own area.
            if (pathname.startsWith('/teacher/exams') && token?.role !== 'TEACHER') {
                return NextResponse.redirect(new URL('/school/exams', req.url));
            }
        }

        // Protect Student Routes (LMS Learning)
        // Allow /student/login without authentication
        if (pathname.startsWith('/student') && pathname !== '/student/login') {
            if (token?.role !== 'STUDENT') {
                // Redirect teachers/admins back to their dashboards if they try to access student area
                if (token?.role === 'TEACHER' || token?.role === 'SCHOOL_ADMIN') {
                    return NextResponse.redirect(new URL('/school/dashboard', req.url));
                }
                return NextResponse.redirect(new URL('/login', req.url));
            }
        }
    },
    {
        pages: {
            signIn: '/login',
        },
        callbacks: {
            authorized: ({ req, token }) => {
                // The public homepage and public pages remain open without a
                // session; they are matched only to redirect signed-in people.
                if (req.nextUrl.pathname === '/' || isPublicPagePath(req.nextUrl.pathname)) {
                    return true;
                }
                // Allow /student/login without authentication
                if (req.nextUrl.pathname === '/student/login') {
                    return true;
                }
                // Guardians must be able to reach sign-in and card activation.
                if (PARENT_PUBLIC_PATHS.has(req.nextUrl.pathname)) {
                    return true;
                }
                // Require token for all other matched routes
                return !!token;
            },
        },
    }
);

export const config = {
    matcher: [
        '/',
        // Public pages: matched only so signed-in people are sent to their
        // dashboard (keep in step with PUBLIC_PAGE_PREFIXES).
        '/events/:path*',
        '/trainings/:path*',
        '/schools/:path*',
        '/students/:path*',
        '/writings/:path*',
        '/magazines/:path*',
        '/winners',
        '/notices',
        '/search',
        '/student-voices',
        '/admin/:path*',
        '/school/:path*',
        '/teacher/:path*',
        '/student/:path*',
        '/parent/:path*',
    ],
};
