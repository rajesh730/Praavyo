import vm from "node:vm";
import { buildZip, crc32 } from "@/lib/zipStore";
import { buildWebsiteKit, indexHtml, slugify, websiteKitFiles } from "@/lib/websiteKit";
import { configPhp } from "@/lib/websiteKit/connectors";

const KEY = "prv_school_live_abcDEF123_-xyz";
const options = {
  schoolName: "Green Villege <School>",
  description: "Learning together",
  apiUrl: "https://www.praavyo.com/api/v1/website",
  apiKey: KEY,
};

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

describe("generated school website", () => {
  const { folder, files } = websiteKitFiles(options);
  const byName = Object.fromEntries(files.map((file) => [file.name.slice(folder.length + 1), file.content]));

  it("contains the website, both connectors and the guide in one folder", () => {
    expect(folder).toBe("green-villege-school-website");
    expect(Object.keys(byName).sort()).toEqual(
      [".env", ".htaccess", "README.txt", "api.php", "assets/site.css", "assets/site.js", "config.php", "index.html", "server.js"].sort()
    );
  });

  it("keeps the API key out of every file a browser can load", () => {
    for (const name of ["index.html", "assets/site.js", "assets/site.css", "README.txt"]) {
      expect(byName[name]).not.toContain(KEY);
    }
    expect(byName["config.php"]).toContain(KEY);
    expect(byName[".env"]).toContain(`PRAAVYO_API_KEY=${KEY}`);
    expect(byName[".htaccess"]).toMatch(/config\\\.php/);
  });

  it("escapes the school name in the page", () => {
    expect(indexHtml(options)).toContain("<title>Green Villege &lt;School&gt;</title>");
  });

  it("has the School life menu the schools asked for", () => {
    for (const label of ["Events", "Notices", "Student writings", "School magazine", "Gallery", "Admission", "Contact"]) {
      expect(byName["index.html"]).toContain(`>${label}<`);
    }
  });

  it("ships browser and Node code that parses", () => {
    expect(() => new vm.Script(byName["assets/site.js"])).not.toThrow();
    expect(() => new vm.Script(byName["server.js"])).not.toThrow();
  });

  it("never writes school content into the page as HTML", () => {
    expect(byName["assets/site.js"]).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
  });

  it("offers both inquiry kinds on the website", () => {
    expect(byName["assets/site.js"]).toContain("General inquiry");
    expect(byName["assets/site.js"]).toContain("Admission inquiry");
  });

  it("builds a downloadable zip named after the school", () => {
    const { fileName, zip } = buildWebsiteKit(options);
    expect(fileName).toBe("green-villege-school-website.zip");
    expect(readZip(zip)).toHaveLength(9);
  });
});

describe("configPhp", () => {
  it("quotes values so a stray quote cannot break out of the PHP string", () => {
    expect(configPhp({ apiUrl: "https://x/'; echo 1; '", apiKey: KEY })).toContain("'https://x/\\'; echo 1; \\''");
  });
});

describe("slugify", () => {
  it("falls back to school for names without latin letters", () => {
    expect(slugify("श्री विद्यालय")).toBe("school");
  });
});
