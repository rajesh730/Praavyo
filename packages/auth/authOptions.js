/**
 * NextAuth configuration — the single source of truth for authentication.
 *
 * This lives in `lib/` rather than in the NextAuth route because ~108 modules
 * import `authOptions`, including `lib/authz.js`. With the config in
 * `app/api/auth/[...nextauth]/route.js`, every one of those imports pointed a
 * lower layer at the delivery layer, inverting the dependency rule in
 * `docs/ARCHITECTURE.md`. The route now imports this and does nothing else.
 *
 * Four roles authenticate here against THREE collections: `User`
 * (SUPER_ADMIN / SCHOOL_ADMIN / TEACHER), `Teacher`, `Student`, and `Parent`.
 * They are separate collections, not rows of one table — the most common source
 * of confusion when reading this file.
 */
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import connectDB from "@pravyo/db";
import User from "@pravyo/db/models/User";
import Teacher from "@pravyo/db/models/Teacher";
import Student from "@pravyo/db/models/Student";
import Parent from "@pravyo/db/models/Parent";
import { findActiveStudentsByIemis } from "@pravyo/db/iemis";
import {
  activeSchoolsForTeacher,
  backfillTeacherMemberships,
  isActiveTeacherMember,
} from "@pravyo/db/teacherMemberships";
import {
  applyRateLimit,
  checkRateLimit,
  recordRateLimitHit,
} from "@pravyo/auth/rateLimit";

const PERSISTENT_SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const SESSION_REFRESH_INTERVAL = 60 * 60 * 24; // 1 day

// How long a token's DB-backed checks (status/authVersion/school/calendar) stay
// trusted before we re-query. Without this, every getServerSession() — and we
// call it on essentially every authenticated render — fired a findById, adding a
// DB round trip to each request. Revalidating at most once per minute keeps
// revocation effectively immediate (≤60s) while cutting the vast majority of
// those queries. A client session.update() bypasses it for instant refreshes.
const TOKEN_REVALIDATE_MS = 60 * 1000;

// Look up a school's display name by id. Pure fetch — call sites decide when to
// re-resolve (e.g. when the user's school changes on transfer) vs. reuse cache.
async function fetchSchoolName(schoolId) {
  if (!schoolId) return null;
  const school = await User.findById(schoolId).select("schoolName name").lean();
  return school?.schoolName || school?.name || null;
}

// Keep the token's cached schoolName in sync with its current school. Tracks
// which school the cached name belongs to (`schoolNameForId`) and re-fetches only
// when that no longer matches the current school — so routine refreshes stay
// cheap, but a transferred student's name updates (including students who were
// already transferred before this tracking existed).
async function syncSchoolOnToken(token, nextSchoolId) {
  const newSchoolId = nextSchoolId?.toString() || null;
  if (!newSchoolId) {
    token.schoolName = null;
    token.schoolNameForId = null;
  } else if (newSchoolId !== token.schoolNameForId || !token.schoolName) {
    token.schoolName = await fetchSchoolName(newSchoolId);
    token.schoolNameForId = newSchoolId;
  }
  token.schoolId = newSchoolId;
}

// Match NextAuth's own secure-cookie detection EXACTLY. We override the session
// cookie below (only to give it a long maxAge), so the name we WRITE must equal
// the name NextAuth/getToken READ back. NextAuth treats cookies as secure when
// NEXTAUTH_URL is https, and otherwise FALLS BACK to "secure on Vercel".
//
// The old check looked only at NEXTAUTH_URL. On Vercel with NEXTAUTH_URL unset,
// the reader expected the `__Secure-` name while we wrote the plain name — the
// token was never found and login silently failed (page just reloads). Setting
// NEXTAUTH_URL to the production https URL is still recommended, but this keeps
// the names aligned even if it isn't.
const useSecureCookies =
  process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

// The account a sign-in attempt is aimed at, for the per-account failure limit.
function loginAccountKey(credentials) {
  // A card token is keyed by the teacher id it claims, not the secret part.
  const cardTeacher = String(credentials?.teacherCard || "").split(".")[0];
  const raw = credentials?.parentId || credentials?.email || cardTeacher || "";
  const key = String(raw).toLowerCase().replace(/[^a-z0-9@._+-]/g, "");
  return key ? key.slice(0, 120) : null;
}

/** The session user for a verified teacher, by password or by login card. */
async function teacherSessionUser(teacher) {
  await backfillTeacherMemberships({ _id: teacher._id });
  const schools = await activeSchoolsForTeacher(teacher._id);
  if (!schools.length) {
    throw new Error("Your teacher account is not active at any school. Contact your school.");
  }

  // One school: go straight in. Several: schoolId stays empty and the
  // teacher picks one at /teacher/select-school.
  return {
    id: teacher._id.toString(),
    email: teacher.email,
    username: teacher.username || null,
    role: "TEACHER",
    name: teacher.name,
    status: "APPROVED",
    schoolId: schools.length === 1 ? schools[0].id : null,
    schoolName: schools.length === 1 ? schools[0].name : null,
  };
}

/**
 * Find the student a sign-in is aimed at. Students sign in with their IEMIS
 * number: the government issues one per student, it is unique across the
 * platform (see apps/pravyo/lib/iemisRegistry.js) and it stays the same when
 * they change school, unlike the username, which is rebuilt from the new
 * school's grade and roll number on transfer.
 *
 * The old username (or email) is still accepted as a fallback during the
 * changeover, so no student is locked out. Remove that branch to make IEMIS
 * the only way in.
 */
async function findStudentForLogin(identifier) {
  // The shared IEMIS rules (packages/db/iemis.js): same cleanup as registration.
  const matches = await findActiveStudentsByIemis(identifier, { limit: 2 });
  if (matches.length > 1) {
    throw new Error(
      "This IEMIS number is registered to more than one student. Ask your school to correct it."
    );
  }
  if (matches.length === 1) return matches[0];

  // Fallback: the old username or email. Usernames are stored lowercase;
  // phone keyboards capitalise the first letter.
  const normalized = String(identifier || "").trim().toLowerCase();
  return Student.findOne({
    $or: [{ username: normalized }, { email: normalized }],
    isDeleted: { $ne: true },
    status: "ACTIVE",
  });
}

/** The session user for a verified student. */
async function studentSessionUser(student, password) {
  const isValid = await bcrypt.compare(password, student.password);
  if (!isValid) {
    throw new Error("Invalid password");
  }
  return {
    id: student._id.toString(),
    email: student.email || student.username, // Use username if email missing
    role: "STUDENT",
    name: student.name,
    status: "ACTIVE", // Default to active as status management is removed
    schoolId: student.school?.toString(),
    calendarPreference: student.calendarPreference || "BS",
  };
}

/**
 * Check one set of credentials and return the session user, or throw an Error
 * whose message the sign-in pages show. Rate limiting lives in `authorize`.
 */
async function verifyCredentials(credentials) {
  const identifier = String(credentials?.email || "").trim();
  const normalizedEmail = identifier.toLowerCase();
  // /parent/login sends loginScope="parent". Without it we would hit the
  // Teacher branch first for a teacher who is ALSO a guardian at the same
  // school (a common case), and they could never reach the parent app.
  // Any other value keeps the pre-existing lookup order untouched.
  const loginScope = String(credentials?.loginScope || "").toLowerCase();

  try {
    await connectDB();
  } catch (error) {
    const rawCode = error?.code || error?.cause?.code || error?.reason?.code;
    const code = /^[A-Z0-9_]+$/.test(String(rawCode || "")) ? rawCode : "UNKNOWN";
    console.error("[auth] Sign-in database connection failed", { code });
    throw new Error("AUTH_SERVICE_UNAVAILABLE");
  }

  // Guardians sign in from /parent/login, which scopes the lookup to the
  // Parent collection only. Nothing below this block changes for the
  // existing admin / teacher / student flows.
  if (loginScope === "parent") {
    // --- Primary path: the Parent ID off the Access Card -------------
    // No email, no phone, no password, no PIN. The one thing printed on
    // the card is the whole credential — see lib/parentCredentials.js for
    // why that trade was made and what it costs.
    if (credentials?.parentId || credentials?.cardToken) {
      const { verifyParentId, verifyParentCardToken } = await import(
        "@pravyo/auth/parentCredentials"
      );

      const result = credentials.cardToken
        ? // A scanned card printed under the old activation flow.
          await verifyParentCardToken(credentials.cardToken)
        : await verifyParentId(credentials.parentId, {
            language: credentials.language,
          });

      if (!result.ok) {
        throw new Error(
          credentials.cardToken
            ? "This card is not valid any more. Please ask your school for a new one."
            : "That Parent ID was not recognised. Please check your card."
        );
      }

      const parent = result.parent;
      const deviceMode =
        credentials.deviceMode === "SHARED" ? "SHARED" : "PERSONAL";

      return {
        id: parent._id.toString(),
        email: parent.email || parent.parentId,
        role: "PARENT",
        name: parent.name,
        status: parent.status,
        schoolId: null,
        authVersion: parent.authVersion || 0,
        calendarPreference: parent.preferences?.calendarPreference || "BS",
        // Drives the shared-device idle window; see the jwt callback.
        deviceMode,
        signedInAt: Date.now(),
      };
    }

    // --- Legacy path: email/phone + password (§15, §57) --------------
    // Kept so guardians created before Parent Access can still sign in.
    // Not deleted; existing users are never forced to migrate.
    const parent = await Parent.findOne({
      $or: [{ email: normalizedEmail }, { phone: identifier }],
      isDeleted: { $ne: true },
    });

    if (!parent) {
      throw new Error("No parent account found for these details");
    }

    if (!parent.password) {
      throw new Error(
        "This account signs in with a Parent ID. Please use the ID on your card."
      );
    }

    const isValid = await bcrypt.compare(
      credentials.password,
      parent.password
    );
    if (!isValid) {
      throw new Error("Invalid password");
    }

    if (parent.status !== "ACTIVE") {
      throw new Error("Your account is inactive. Please contact your school.");
    }

    // Fire-and-forget: a failed timestamp write must never block a login.
    Parent.updateOne(
      { _id: parent._id },
      { $set: { lastLoginAt: new Date() } }
    ).catch(() => {});

    return {
      id: parent._id.toString(),
      email: parent.email || parent.phone,
      role: "PARENT",
      name: parent.name,
      status: parent.status,
      // A guardian is not scoped to a single school — they may have
      // children at several. School context is resolved per selected
      // child by lib/parentAccess.js, never from the session.
      schoolId: null,
      authVersion: parent.authVersion || 0,
      calendarPreference: parent.preferences?.calendarPreference || "BS",
    };
  }

  // The student login page (/student/login) looks at students only, so an
  // IEMIS number is never tried against staff accounts.
  if (loginScope === "student") {
    const student = await findStudentForLogin(identifier);
    if (!student) {
      throw new Error("No student found with this IEMIS number. Check the number on your report card.");
    }
    return studentSessionUser(student, credentials.password);
  }

  // A scanned Teacher Login Card: the signed card token is the whole
  // credential, like the Parent Access Card. See teacherCardToken.js.
  if (credentials?.teacherCard) {
    const { verifyTeacherCardToken } = await import("@pravyo/auth/teacherCardToken");
    const result = await verifyTeacherCardToken(credentials.teacherCard);
    if (!result.ok) {
      throw new Error("This login card is not valid any more. Please ask your school for a new one.");
    }
    return teacherSessionUser(result.teacher);
  }

  // 1. Try Teacher collection FIRST (Clean Architecture). The account is
  // the person; which schools they may open comes from TeacherMembership.
  const teacher = await Teacher.findOne({
    $or: [{ email: normalizedEmail }, { username: normalizedEmail }],
  });

  if (teacher) {
    let isValid = false;

    if (teacher.password) {
      isValid = await bcrypt.compare(
        credentials.password,
        teacher.password,
      );
    } else {
      // Fallback: a legacy teacher whose credentials live in the User
      // collection. Hashed compare only — no plaintext path.
      const user = await User.findOne({ email: normalizedEmail });
      if (user && user.password) {
        isValid = await bcrypt.compare(
          credentials.password,
          user.password,
        );
      }
    }

    if (!isValid) {
      throw new Error("Invalid password");
    }

    return teacherSessionUser(teacher);
  }

  // 2. Try User collection (Admins, School Admins, Legacy support)
  const user = await User.findOne({ email: normalizedEmail });

  if (user) {
    const isValid = await bcrypt.compare(
      credentials.password,
      user.password,
    );

    if (!isValid) {
      throw new Error("Invalid password");
    }

    if (user.status === "PENDING") {
      throw new Error("Your account is pending approval.");
    }

    if (user.status === "REJECTED") {
      throw new Error("Your account has been rejected.");
    }

    if (user.status === "UNSUBSCRIBED") {
      throw new Error("Your account is inactive.");
    }

    if (["STUDENT", "TEACHER"].includes(user.role)) {
      throw new Error("Your profile is inactive or unavailable.");
    }

    // Resolve a schoolId for downstream filtering
    let schoolId = null;

    if (user.role === "SCHOOL_ADMIN") {
      schoolId = user._id.toString();
    }

    return {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name:
        user.role === "SUPER_ADMIN"
          ? user.name || user.email
          : user.schoolName || "Admin",
      schoolName:
        user.role === "SUPER_ADMIN" ? null : user.schoolName || null,
      status: user.status,
      schoolId,
      authVersion: user.authVersion || 0,
      calendarPreference: user.calendarPreference || "BS",
    };
  }

  // 3. Try Student collection: IEMIS number first, then the old username.
  const student = await findStudentForLogin(identifier);
  if (student) {
    return studentSessionUser(student, credentials.password);
  }

  throw new Error("No user found with this email/username");
}

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email/Username", type: "text" },
        password: { label: "Password", type: "password" },
        loginScope: { label: "Login scope", type: "text" },
        // Parent Access sign-in. The Parent ID is the credential; `cardToken`
        // is the same thing arriving from a scanned legacy QR card.
        parentId: { label: "Parent ID", type: "text" },
        cardToken: { label: "Card token", type: "password" },
        // A scanned Teacher Login Card; see teacherCardToken.js.
        teacherCard: { label: "Teacher card", type: "password" },
        language: { label: "Language", type: "text" },
        deviceMode: { label: "Device mode", type: "text" },
      },
      async authorize(credentials, req) {
        // Throttle per client IP and per account to blunt brute-forcing.
        //
        // Only FAILED attempts count. Mobile carriers in Nepal put thousands of
        // phones behind one public IP, and a school's Wi-Fi does the same, so
        // counting every sign-in locked whole parent meetings out after the
        // fifteenth successful login.
        const ip =
          String(req?.headers?.["x-forwarded-for"] || "")
            .split(",")[0]
            .trim() || "unknown";
        const account = loginAccountKey(credentials);
        const windowMs = 10 * 60 * 1000;
        const limits = [
          { key: `login-fail:ip:${ip}`, windowMs, max: 40 },
          ...(account ? [{ key: `login-fail:acct:${account}`, windowMs, max: 10 }] : []),
        ];

        // A hard ceiling on all attempts from one IP still stops floods.
        const flood = await applyRateLimit({ key: `login:${ip}`, windowMs, max: 400 });
        const checks = flood.ok ? await Promise.all(limits.map(checkRateLimit)) : [flood];
        const blocked = checks.find((check) => !check.ok);
        if (blocked) {
          const minutes = Math.max(1, Math.ceil(blocked.retryAfter / 60));
          throw new Error(
            `Too many login attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
          );
        }

        try {
          return await verifyCredentials(credentials);
        } catch (error) {
          // An outage is not the user's fault and must not lock them out.
          if (error?.message !== "AUTH_SERVICE_UNAVAILABLE") {
            await Promise.all(limits.map(recordRateLimitHit));
          }
          throw error;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.status = user.status;
        token.schoolId = user.schoolId || null;
        token.schoolName = user.schoolName || null;
        token.authVersion = user.authVersion || 0;
        token.calendarPreference = user.calendarPreference || "BS";
        token.lastValidatedAt = Date.now();
        // Shared-device policy (§12). The cookie itself is long-lived for
        // everyone, but a SHARED session stops being trusted after a short
        // idle window and lib/parentAccess.js then sends the guardian back to
        // sign in. Enforcing it server-side means clearing localStorage cannot
        // bypass it.
        if (user.deviceMode) token.deviceMode = user.deviceMode;
        if (user.signedInAt) token.signedInAt = user.signedInAt;
        delete token.error;
      } else if (
        token?.id &&
        // Skip the DB revalidation when we checked recently — unless the client
        // explicitly asked for a refresh via session.update().
        (trigger === "update" ||
          !token.lastValidatedAt ||
          Date.now() - token.lastValidatedAt >= TOKEN_REVALIDATE_MS)
      ) {
        await connectDB();
        token.lastValidatedAt = Date.now();
        const role = String(token.role || "");

        if (["SUPER_ADMIN", "SCHOOL_ADMIN"].includes(role)) {
          const currentUser = await User.findById(token.id).select(
            "authVersion status role schoolName email calendarPreference"
          );

          if (!currentUser) {
            token.error = "SessionRevoked";
            delete token.role;
            delete token.schoolId;
          } else {
            token.status = currentUser.status;
            token.calendarPreference = currentUser.calendarPreference || "BS";
            token.schoolName =
              role === "SUPER_ADMIN" ? null : currentUser.schoolName || null;
            if (role === "SCHOOL_ADMIN") {
              token.name = currentUser.schoolName || "Admin";
              token.email = currentUser.email;
            }
            if ((currentUser.authVersion || 0) !== (token.authVersion || 0)) {
              token.error = "SessionRevoked";
              delete token.role;
              delete token.schoolId;
            }
          }
        } else if (role === "TEACHER") {
          const currentTeacher = await Teacher.exists({ _id: token.id });
          // A teacher choosing or switching school sends { schoolId } through
          // session.update(); it is honoured only for an ACTIVE membership.
          const requested =
            trigger === "update" && session && "schoolId" in session
              ? String(session.schoolId || "")
              : null;

          if (!currentTeacher) {
            token.error = "SessionRevoked";
            delete token.role;
            delete token.schoolId;
          } else {
            await backfillTeacherMemberships({ _id: token.id });
            const wanted = requested ?? token.schoolId;
            if (wanted && (await isActiveTeacherMember(token.id, wanted))) {
              await syncSchoolOnToken(token, wanted);
            } else {
              // Marked Left/Inactive at the current school (or never chose).
              // With exactly one school left, move there; with several, send
              // them to choose; with none, the session ends.
              const schools = await activeSchoolsForTeacher(token.id);
              if (!schools.length) {
                token.error = "SessionRevoked";
                delete token.role;
                delete token.schoolId;
              } else {
                await syncSchoolOnToken(token, schools.length === 1 ? schools[0].id : null);
              }
            }
          }
        } else if (role === "PARENT") {
          const currentParent = await Parent.findById(token.id).select(
            "status isDeleted accessState authVersion preferences"
          );

          if (
            !currentParent ||
            currentParent.isDeleted ||
            currentParent.status !== "ACTIVE" ||
            currentParent.accessState !== "ACTIVATED" ||
            (currentParent.authVersion || 0) !== (token.authVersion || 0)
          ) {
            token.error = "SessionRevoked";
            delete token.role;
            delete token.schoolId;
          } else {
            token.status = currentParent.status;
            token.calendarPreference =
              currentParent.preferences?.calendarPreference || "BS";
            // Never cache a school on a parent token — see the note in
            // authorize(). Child selection decides school, per request.
            token.schoolId = null;
            token.schoolName = null;
          }
        } else if (role === "STUDENT") {
          const currentStudent = await Student.findById(token.id).select(
            "status isDeleted school calendarPreference"
          );

          if (
            !currentStudent ||
            currentStudent.isDeleted ||
            currentStudent.status !== "ACTIVE"
          ) {
            token.error = "SessionRevoked";
            delete token.role;
            delete token.schoolId;
          } else {
            token.calendarPreference = currentStudent.calendarPreference || "BS";
            await syncSchoolOnToken(token, currentStudent.school);
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.role = token.role;
        session.user.id = token.id;
        session.user.status = token.status;
        session.user.schoolId = token.schoolId || null;
        session.user.schoolName = token.schoolName || null;
        session.user.authVersion = token.authVersion || 0;
        session.user.calendarPreference = token.calendarPreference || "BS";
        session.user.deviceMode = token.deviceMode || "PERSONAL";
        session.user.signedInAt = token.signedInAt || null;
        if (token.error) {
          session.error = token.error;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: PERSISTENT_SESSION_MAX_AGE,
    updateAge: SESSION_REFRESH_INTERVAL,
  },
  jwt: {
    maxAge: PERSISTENT_SESSION_MAX_AGE,
  },
  // Explicitly persist the session cookie. Setting maxAge on the cookie itself
  // writes a Max-Age into the Set-Cookie header, so the cookie survives tab and
  // browser closes (instead of being a session-only cookie). The user stays
  // logged in until they explicitly sign out or the year elapses.
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: PERSISTENT_SESSION_MAX_AGE,
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
