import vm from "node:vm";
import { buildZip, crc32 } from "@/lib/zipStore";
import { buildWebsiteApiKit, slugify, websiteApiKitFiles } from "@/lib/websiteApiKit";
import { KEY_PLACEHOLDER, WEBSITE_API_ENDPOINTS, websiteApiGuide, websiteApiOpenApi } from "@/lib/websiteApiGuide";
import { WEBSITE_LISTS, WEBSITE_DETAILS } from "@/lib/websiteApi";

const KEY = "prv_school_live_abcDEF123_-xyz";
const API = "https://www.praavyo.com/api/v1/website";
const options = { schoolName: "Green Villege <School>", apiUrl: API, apiKey: KEY };

/** Read a STORE-only zip back: [{ name, data }]. */
function readZip(buffer) {
  const files = [];
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const crc = buffer.readUInt32LE(offset + 14);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    const data = buffer.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
    expect(crc32(data)).toBe(crc);
    files.push({ name, data });
    offset += 30 + nameLength + size;
  }
  expect(buffer.readUInt32LE(buffer.length - 22)).toBe(0x06054b50);
  expect(buffer.readUInt16LE(buffer.length - 12)).toBe(files.length);
  return files;
}

describe("buildZip", () => {
  it("writes a readable zip with correct checksums", () => {
    const files = readZip(buildZip([{ name: "a.txt", content: "hello" }, { name: "dir/b.txt", content: "नमस्ते" }]));
    expect(files.map((file) => file.name)).toEqual(["a.txt", "dir/b.txt"]);
    expect(files[1].data.toString("utf8")).toBe("नमस्ते");
  });

  it("matches the standard CRC-32", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});

describe("Website API developer kit", () => {
  const { folder, files } = websiteApiKitFiles(options);
  const byName = Object.fromEntries(files.map((file) => [file.name.slice(folder.length + 1), file.content]));

  it("holds only the API: manual, OpenAPI, .env and examples — no website", () => {
    expect(folder).toBe("green-villege-school-praavyo-api");
    expect(Object.keys(byName).sort()).toEqual(
      [".env", "README.md", "examples/curl.sh", "examples/praavyo.mjs", "examples/praavyo.php", "openapi.json"].sort()
    );
    expect(Object.keys(byName).some((name) => name.endsWith(".html"))).toBe(false);
  });

  it("puts the base URL and key where the developer needs them", () => {
    expect(byName[".env"]).toContain(`PRAAVYO_API_URL=${API}`);
    expect(byName[".env"]).toContain(`PRAAVYO_API_KEY=${KEY}`);
    expect(byName["README.md"]).toContain(KEY);
    expect(byName["README.md"]).toContain(API);
    // Example code reads the key from the environment, never hard-codes it.
    for (const name of ["examples/praavyo.mjs", "examples/praavyo.php", "examples/curl.sh"]) {
      expect(byName[name]).not.toContain(KEY);
    }
  });

  it("documents every endpoint the API serves", () => {
    const documented = WEBSITE_API_ENDPOINTS.map(([resource]) => resource).sort();
    expect(documented).toEqual(Object.keys(WEBSITE_LISTS).sort());
    for (const [resource, , detail] of WEBSITE_API_ENDPOINTS) {
      expect(Boolean(WEBSITE_DETAILS[resource])).toBe(detail);
    }
    const spec = JSON.parse(byName["openapi.json"]);
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.servers[0].url).toBe(API);
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/school", "/notices/{id}", "/gallery/{id}", "/forms", "/inquiries"])
    );
    expect(JSON.stringify(spec)).not.toContain(KEY);
  });

  it("ships example JavaScript that parses", () => {
    const moduleCode = byName["examples/praavyo.mjs"].replace(/^export /gm, "");
    expect(() => new vm.Script(`(async () => {\n${moduleCode}\n})`)).not.toThrow();
  });

  it("uses a placeholder when no key is given", () => {
    expect(websiteApiGuide({ apiBase: API })).toContain(KEY_PLACEHOLDER);
    expect(websiteApiOpenApi({ apiBase: API }).components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });

  it("zips the kit under a safe file name", () => {
    const { fileName, zip } = buildWebsiteApiKit(options);
    expect(fileName).toBe("green-villege-school-praavyo-api.zip");
    expect(readZip(zip)).toHaveLength(6);
    expect(slugify("")).toBe("school");
  });
});
