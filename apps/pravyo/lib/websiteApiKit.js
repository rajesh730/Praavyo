import { buildZip } from "./zipStore.js";
import { websiteApiExamples, websiteApiGuide, websiteApiOpenApi } from "./websiteApiGuide.js";

/**
 * The developer kit a school hands to whoever builds its website
 * (Settings → Website → Download API kit). Only the API, no website:
 *
 *   README.md            the manual: credentials, security, endpoints, forms, errors
 *   openapi.json         OpenAPI 3 contract (Postman, Swagger, code generators)
 *   .env                 PRAAVYO_API_URL + PRAAVYO_API_KEY for the website's server
 *   examples/praavyo.mjs Node.js client     examples/praavyo.php  PHP client
 *   examples/curl.sh     terminal test
 */

export function slugify(value) {
  return (
    String(value || "school")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 60) || "school"
  );
}

/** Every file of the kit inside one folder. */
export function websiteApiKitFiles({ schoolName, apiUrl, apiKey }) {
  const folder = `${slugify(schoolName)}-praavyo-api`;
  const examples = websiteApiExamples({ apiBase: apiUrl, apiKey });
  const files = [
    ["README.md", websiteApiGuide({ apiBase: apiUrl, apiKey, schoolName })],
    ["openapi.json", `${JSON.stringify(websiteApiOpenApi({ apiBase: apiUrl, schoolName }), null, 2)}\n`],
    [".env", examples.env],
    ["examples/praavyo.mjs", examples.node],
    ["examples/praavyo.php", examples.php],
    ["examples/curl.sh", examples.curl],
  ];
  return { folder, files: files.map(([name, content]) => ({ name: `${folder}/${name}`, content })) };
}

/** The kit as a .zip Buffer and its file name. */
export function buildWebsiteApiKit(options) {
  const { folder, files } = websiteApiKitFiles(options);
  return { fileName: `${folder}.zip`, zip: buildZip(files) };
}
