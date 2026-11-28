import { defineRoute } from "@/lib/routeHandler";
import User from "@/models/User";
import SchoolWebsiteApiKey from "@/models/SchoolWebsiteApiKey";
import { createWebsiteApiKey, hashWebsiteApiKey } from "@/lib/websiteApiAuth";
import { buildWebsiteApiKit } from "@/lib/websiteApiKit";
import { websiteOrigin } from "@/lib/websiteApi";
import { errorResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const MAX_ACTIVE_KEYS = 5;

/**
 * POST { apiKey? } — download the Website API developer kit (.zip): manual,
 * OpenAPI spec, .env and example clients. With `apiKey` (one of the school's
 * active keys, e.g. just created on the same screen) that key is written into
 * the kit; otherwise a new key named "Developer kit (<date>)" is created for
 * it and appears in the key list, where it can be revoked.
 */
export const POST = defineRoute(
  { roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to prepare the API kit" },
  async ({ request, session }) => {
    const schoolId = session.user.id;
    const body = await request.json().catch(() => ({}));

    let apiKey = "";
    const offered = String(body?.apiKey || "").trim();
    if (offered) {
      const match = await SchoolWebsiteApiKey.exists({
        school: schoolId,
        keyHash: hashWebsiteApiKey(offered),
        revokedAt: null,
      });
      if (!match) return errorResponse(400, "That API key is not an active key of your school.", "INVALID_API_KEY");
      apiKey = offered;
    } else {
      const active = await SchoolWebsiteApiKey.countDocuments({ school: schoolId, revokedAt: null });
      if (active >= MAX_ACTIVE_KEYS) {
        return errorResponse(
          409,
          "You already have 5 active API keys. Revoke one you no longer use, then download again.",
          "KEY_LIMIT"
        );
      }
      const generated = createWebsiteApiKey();
      await SchoolWebsiteApiKey.create({
        school: schoolId,
        name: `Developer kit (${new Date().toISOString().slice(0, 10)})`,
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        lastFour: generated.lastFour,
        createdBy: session.user.id,
      });
      apiKey = generated.rawKey;
    }

    const school = await User.findById(schoolId).select("schoolName").lean();
    const { fileName, zip } = buildWebsiteApiKit({
      schoolName: school?.schoolName || "School",
      apiUrl: `${websiteOrigin(request)}/api/v1/website`,
      apiKey,
    });

    return new Response(zip, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(zip.length),
        "Cache-Control": "no-store",
      },
    });
  }
);
