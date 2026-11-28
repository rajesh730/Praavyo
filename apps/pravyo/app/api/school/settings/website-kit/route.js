import { defineRoute } from "@/lib/routeHandler";
import User from "@/models/User";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import SchoolWebsiteApiKey from "@/models/SchoolWebsiteApiKey";
import { createWebsiteApiKey, hashWebsiteApiKey } from "@/lib/websiteApiAuth";
import { buildWebsiteKit } from "@/lib/websiteKit";
import { websiteOrigin } from "@/lib/websiteApi";
import { errorResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const MAX_ACTIVE_KEYS = 5;

/**
 * POST { apiKey? } — download the school's generated website (.zip), already
 * connected to Praavyo. With `apiKey` (one of the school's active keys, e.g.
 * just created in the same screen) that key is written into the website's
 * server files; otherwise a new key named "Generated website (<date>)" is
 * created for it and appears in the key list, where it can be revoked.
 */
export const POST = defineRoute(
  { roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to generate the website" },
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
        name: `Generated website (${new Date().toISOString().slice(0, 10)})`,
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        lastFour: generated.lastFour,
        createdBy: session.user.id,
      });
      apiKey = generated.rawKey;
    }

    const [school, profile] = await Promise.all([
      User.findById(schoolId).select("schoolName").lean(),
      SchoolShowcaseProfile.findOne({ school: schoolId }).select("tagline").lean(),
    ]);

    const { fileName, zip } = buildWebsiteKit({
      schoolName: school?.schoolName || "School",
      description: profile?.tagline || "",
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
