import connectDB from "@pravyo/db";
import User from "@pravyo/db/models/User";
import Teacher from "@pravyo/db/models/Teacher";
import { isActiveTeacherMember } from "@pravyo/db/teacherMemberships";
import { LIBRARY_SCHOOL_ID } from "@pravyo/core/themeLibrary";

/**
 * Who is calling, and what may they touch. Dumy
 *
 * Two rules run through everything:
 *
 *  1. School identity comes from the SESSION, never from the request. A browser
 *     may not name the school whose data it wants — that is the tenant
 *     boundary, and a `schoolId` body field would hand it away.
 *  2. Every private route re-checks authorization server-side. Hiding a button
 *     is a courtesy, not a security control.
 *
 * CAS creates no accounts and stores no passwords. Identity resolves against
 * the same Pravyo collections the main platform authenticates against, through
 * the shared @pravyo/auth config — so signing out of either app signs the user
 * out of both.
 */

export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function assert(condition, message, status = 400) {
  if (!condition) throw new HttpError(message, status);
}

export function sameId(a, b) {
  return Boolean(a && b && String(a) === String(b));
}

/**
 * Resolve the signed-in actor.
 *
 * Re-reads the underlying Pravyo record on every call rather than trusting the
 * JWT alone: an account deactivated a minute ago must lose access now, not when
 * its year-long session cookie eventually expires.
 */
export async function getActor() {
  // These are only needed for an HTTP request. Keeping them lazy means the
  // domain services can also run from an authorized maintenance job without
  // bootstrapping NextAuth's browser-provider configuration.
  const [{ getServerSession }, { authOptions }] = await Promise.all([
    import("next-auth"),
    import("@pravyo/auth"),
  ]);
  const session = await getServerSession(authOptions);
  assert(
    session?.user?.id && !session.error,
    "Sign in with your Pravyo account",
    401,
  );

  await connectDB();
  const { id, role } = session.user;

  if (role === "SCHOOL_ADMIN") {
    const row = await User.findOne({
      _id: id,
      role: "SCHOOL_ADMIN",
      status: { $in: ["APPROVED", "SUBSCRIBED"] },
    })
      .select("schoolName name authVersion calendarPreference")
      .lean();
    assert(row, "This school account cannot access assessment", 403);
    assert(
      (row.authVersion || 0) === (session.user.authVersion || 0),
      "Your session was revoked. Sign in again.",
      401,
    );
    return {
      id: String(row._id),
      role: "SCHOOL_ADMIN",
      // A school admin IS the school in Pravyo's data model — there is no
      // separate School collection.
      school: String(row._id),
      name: row.schoolName || row.name || "School",
      calendar: row.calendarPreference || "BS",
    };
  }

  if (role === "TEACHER") {
    // A teacher may work at several schools; the session names the one they
    // chose, and the membership must still be ACTIVE (not Left or Inactive).
    const school = session.user.schoolId;
    assert(school, "Choose the school you are working in", 403);
    const row = await Teacher.findById(id).select("name").lean();
    assert(row, "This teacher account is no longer active", 403);
    assert(
      await isActiveTeacherMember(row._id, school),
      "You no longer have access to this school",
      403,
    );

    return {
      id: String(row._id),
      role: "TEACHER",
      school: String(school),
      name: row.name || "Teacher",
      calendar: session.user.calendarPreference || "BS",
    };
  }

  // The super admin edits the platform's default theme library with the same
  // Curriculum editor. The library is a reserved id, not a real school, and
  // casRoute only lets this actor reach curriculum routes.
  if (role === "SUPER_ADMIN") {
    return {
      id: String(id),
      role: "SCHOOL_ADMIN",
      school: LIBRARY_SCHOOL_ID,
      library: true,
      name: "Default theme library",
      calendar: session.user.calendarPreference || "BS",
    };
  }

  throw new HttpError(
    "Continuous Assessment is for school accounts. Guardians and students see published reports in the Pravyo dashboard.",
    403,
  );
}

/** School-wide setup, publishing and other administrative changes. */
export function requireSchoolAdmin(actor) {
  assert(
    actor.role === "SCHOOL_ADMIN",
    "Only the school account can change this",
    403,
  );
  return actor;
}

/** Uniform JSON error shape for route handlers. */
export function errorResponse(error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message =
    status === 500
      ? "Something went wrong. Please try again."
      : error.message || "Request failed";
  if (status === 500) console.error("[cas]", error);
  return Response.json({ error: message }, { status });
}

export function ok(data, init) {
  return Response.json(
    { data },
    { headers: { "Cache-Control": "private, no-store" }, ...init },
  );
}
