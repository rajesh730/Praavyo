import { GENERAL_INQUIRY_FIELDS, HONEYPOT_FIELD, admissionFields } from "./inquiryForms.js";

/**
 * The Website API developer documentation, written once. Used by:
 *   - Settings → Website → "Download API kit" (lib/websiteApiKit.js), which
 *     zips README.md, openapi.json, .env and the example clients;
 *   - the same screen's "Copy complete guide" button.
 * Keep it in step with lib/websiteApi.js (content), lib/inquiryForms.js
 * (form fields) and app/api/v1/website/* (routes, errors, limits).
 * Client-safe: no server imports.
 */

export const KEY_PLACEHOLDER = "YOUR_API_KEY";

/** Every GET resource: [resource, label, hasDetail, what it returns]. */
export const WEBSITE_API_ENDPOINTS = [
  ["school", "School profile", false, "Name, address, phone, email, logo, banner, social links, admission status."],
  ["notices", "Public notices", true, "Notices the school marks “Also show on our school website”."],
  ["events", "Events and programs", true, "Competitions and school programs (Dashain, sports day…), newest first."],
  ["writings", "Student writings", true, "Writings on the school wall and in published magazines; detail has formatted `blocks`."],
  ["magazines", "School magazines", true, "Published magazine issues; detail includes the articles."],
  ["gallery", "Gallery albums", true, "Public albums; detail includes the photos."],
  ["achievements", "Achievements", false, "Public student and team achievements."],
  ["admission", "Admission season", false, "OPEN/CLOSED, the notice to show, grades, deadline and the admission form."],
  ["forms", "Form fields", false, "The general inquiry and admission forms, field by field."],
];

export const WEBSITE_API_ERRORS = [
  [400, "VALIDATION_ERROR", "A form field is missing or invalid. `message` says which; show it to the visitor."],
  [400, "GRADE_NOT_OPEN", "Admission for a grade that is not taking applications. Show `message`."],
  [401, "API_KEY_REQUIRED", "No `Authorization: Bearer …` header."],
  [401, "INVALID_API_KEY", "The key is wrong or has been revoked."],
  [404, "RESOURCE_NOT_FOUND", "Unknown resource name in the URL."],
  [404, "NOT_FOUND", "No such item, or it is no longer public."],
  [404, "SCHOOL_NOT_FOUND", "The school's Praavyo account is not active."],
  [405, "METHOD_NOT_ALLOWED", "POST is only accepted on /inquiries."],
  [429, "RATE_LIMITED", "Too many requests. Wait and retry; show `message` on forms."],
  [500, "INTERNAL_SERVER_ERROR", "Praavyo had a problem. Retry later; serve your cached copy meanwhile."],
];

function fieldRows(fields) {
  return fields
    .map((field) => {
      const rules = [
        field.minLength ? `min ${field.minLength}` : "",
        field.maxLength ? `max ${field.maxLength}` : "",
        field.options?.length ? field.options.join(" / ") : "",
        field.help || "",
      ].filter(Boolean);
      return `| \`${field.name}\` | ${field.label} | ${field.type} | ${field.required ? "Yes" : "No"} | ${rules.join("; ")} |`;
    })
    .join("\n");
}

const FIELD_HEAD = "| Field | Label | Type | Required | Rules |\n|---|---|---|---|---|";

/** Example clients a developer can copy into the website's server code. */
export function websiteApiExamples({ apiBase, apiKey = KEY_PLACEHOLDER }) {
  const env = `# Praavyo Website API — server-side settings. Keep this file private.
# Never commit it to git and never send it to the browser.
PRAAVYO_API_URL=${apiBase}
PRAAVYO_API_KEY=${apiKey}
`;

  const curl = `#!/usr/bin/env sh
# Quick test from a terminal:  sh examples/curl.sh
# Reads PRAAVYO_API_URL and PRAAVYO_API_KEY from ../.env
set -e
cd "$(dirname "$0")"
set -a; . ../.env; set +a

echo "School profile:"
curl -s "$PRAAVYO_API_URL/school" -H "Authorization: Bearer $PRAAVYO_API_KEY"
echo; echo; echo "Latest notices:"
curl -s "$PRAAVYO_API_URL/notices?page=1&limit=5" -H "Authorization: Bearer $PRAAVYO_API_KEY"
echo; echo; echo "Form fields:"
curl -s "$PRAAVYO_API_URL/forms" -H "Authorization: Bearer $PRAAVYO_API_KEY"
echo
`;

  const node = `// Praavyo Website API client for Node.js 18+ (server side only).
// Usage:
//   import { praavyoGet, praavyoSendInquiry } from "./praavyo.mjs";
//   const school  = await praavyoGet("school");
//   const notices = await praavyoGet("notices", { page: 1, limit: 10 });
//   const notice  = await praavyoGet(\`notices/\${id}\`);
//   await praavyoSendInquiry(formBody, visitorIp);
// Reads PRAAVYO_API_URL and PRAAVYO_API_KEY from the environment (.env).

const API_URL = (process.env.PRAAVYO_API_URL || "").replace(/\\/+$/, "");
const API_KEY = process.env.PRAAVYO_API_KEY || "";
const CACHE_MS = 60 * 1000; // Praavyo content changes rarely; a minute is fresh enough.
const cache = new Map();

export class PraavyoError extends Error {
  constructor(status, code, message) {
    super(message || \`Praavyo API error \${status}\`);
    this.status = status;
    this.code = code || "ERROR";
  }
}

async function call(path, { method = "GET", query, body, headers = {} } = {}) {
  if (!API_URL || !API_KEY) throw new PraavyoError(0, "NOT_CONFIGURED", "Set PRAAVYO_API_URL and PRAAVYO_API_KEY");
  const url = new URL(\`\${API_URL}/\${String(path).replace(/^\\/+/, "")}\`);
  for (const [name, value] of Object.entries(query || {})) url.searchParams.set(name, String(value));
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) throw new PraavyoError(response.status, json.code, json.message);
  return json;
}

/** GET a resource. Cached for a minute; the last good copy is served if Praavyo is unreachable. */
export async function praavyoGet(path, query = {}) {
  const live = ["admission", "forms"].includes(String(path).replace(/^\\/+/, ""));
  const key = \`\${path}?\${new URLSearchParams(query)}\`;
  const hit = cache.get(key);
  if (!live && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  try {
    const { data } = await call(path, { query });
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (error) {
    if (hit && (error.status === 0 || error.status >= 500 || error.name === "TimeoutError")) return hit.data;
    throw error;
  }
}

/**
 * Send a contact or admission form. \`body\` = { type: "GENERAL" | "ADMISSION", ...fields }
 * exactly as GET /forms describes. Pass the visitor's IP for fair rate limits.
 * Returns { message, data } — for admissions data.forNextYear tells whether it
 * was taken for next year. Throws PraavyoError (status 400/429: show error.message).
 */
export async function praavyoSendInquiry(body, visitorIp = "") {
  const json = await call("inquiries", {
    method: "POST",
    body,
    headers: visitorIp ? { "X-Visitor-IP": String(visitorIp) } : {},
  });
  return { message: json.message, data: json.data || {} };
}
`;

  const php = `<?php
// Praavyo Website API client for PHP 7.4+ (server side only; uses curl).
// Usage:
//   require __DIR__ . '/praavyo.php';
//   $school  = praavyo_get('school');
//   $notices = praavyo_get('notices', ['page' => 1, 'limit' => 10]);
//   $result  = praavyo_send_inquiry($_POST + ['type' => 'GENERAL']);
// Set PRAAVYO_API_URL and PRAAVYO_API_KEY as environment variables, or define
// them as constants in a config file OUTSIDE public_html.

function praavyo_setting($name) {
    if (defined($name)) return constant($name);
    $value = getenv($name);
    return $value === false ? '' : $value;
}

function praavyo_request($method, $path, $query = [], $body = null) {
    $url = rtrim(praavyo_setting('PRAAVYO_API_URL'), '/') . '/' . ltrim($path, '/');
    if ($query) $url .= '?' . http_build_query($query);
    $headers = [
        'Authorization: Bearer ' . praavyo_setting('PRAAVYO_API_KEY'),
        'Accept: application/json',
    ];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        $headers[] = 'X-Visitor-IP: ' . ($_SERVER['REMOTE_ADDR'] ?? '');
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = json_decode($raw ?: '', true) ?: [];
    if ($status < 200 || $status >= 300 || ($json['success'] ?? false) !== true) {
        throw new RuntimeException($json['message'] ?? "Praavyo API error $status", $status);
    }
    return $json;
}

/** GET a resource, cached for 60 seconds in the system temp folder. */
function praavyo_get($path, $query = []) {
    $live = in_array(trim($path, '/'), ['admission', 'forms'], true);
    $file = sys_get_temp_dir() . '/praavyo_' . md5($path . '?' . http_build_query($query)) . '.json';
    if (!$live && is_file($file) && time() - filemtime($file) < 60) {
        return json_decode(file_get_contents($file), true);
    }
    try {
        $data = praavyo_request('GET', $path, $query)['data'];
        @file_put_contents($file, json_encode($data));
        return $data;
    } catch (RuntimeException $error) {
        // Praavyo unreachable: serve the last good copy if there is one.
        if (($error->getCode() === 0 || $error->getCode() >= 500) && is_file($file)) {
            return json_decode(file_get_contents($file), true);
        }
        throw $error;
    }
}

/** POST a contact or admission form: ['type' => 'GENERAL'|'ADMISSION', ...fields from GET /forms]. */
function praavyo_send_inquiry(array $fields) {
    $json = praavyo_request('POST', 'inquiries', [], $fields);
    return ['message' => $json['message'] ?? '', 'data' => $json['data'] ?? []];
}
`;

  return { env, curl, node, php };
}

/** The developer manual (Markdown): README.md in the kit, and the copied guide. */
export function websiteApiGuide({ apiBase, apiKey = KEY_PLACEHOLDER, schoolName = "" }) {
  const title = schoolName ? `${schoolName} — Praavyo Website API` : "Praavyo Website API";
  const hasKey = apiKey && apiKey !== KEY_PLACEHOLDER;
  return `# ${title}

Connect the school's own website to Praavyo. The website reads the school's
public content (profile, notices, events, student writings, magazines,
gallery, achievements, admission) and sends its contact and admission forms
to the school's Praavyo **Inquiries**, marked “Through website”.

The design of the website is entirely yours. This API only supplies the data.

## 1. Credentials

| | |
|---|---|
| Base URL | \`${apiBase}\` |
| API key | ${hasKey ? `\`${apiKey}\`` : "Create one in Praavyo → Settings → Website, then put it in `.env`"} |
| Auth header | \`Authorization: Bearer <API key>\` |
| Format | JSON (UTF-8), HTTPS only |

The key identifies the school, so requests never carry a school ID.

### Keep the key secret

- Use it **only on the website's server** (PHP, Node.js, Python, WordPress
  plugin code…). Never in JavaScript that runs in the browser, HTML, a mobile
  app or a public git repository. Anyone holding the key can read the
  school's public data and send inquiries in its name.
- Store it as an environment variable (\`PRAAVYO_API_KEY\`) or in a config file
  outside the public web folder. \`.env\` in this kit is ready to use.
- Browser → your server → Praavyo. Your own pages call your server; your
  server adds the key and calls Praavyo.
- One key per website (e.g. “Main website”, “Staging”). Up to 5 active keys.
- **Rotate**: create a new key, deploy it, then revoke the old one in
  Settings → Website. A revoked key stops working at once.
- Praavyo shows a key only once, when it is created. If it is lost, create a
  new one.

## 2. Quick start

\`\`\`sh
curl "${apiBase}/school" -H "Authorization: Bearer ${apiKey}"
\`\`\`

Ready-made clients are in \`examples/\`: \`praavyo.mjs\` (Node.js),
\`praavyo.php\` (PHP / cPanel) and \`curl.sh\` (terminal test). The full
machine-readable contract is \`openapi.json\` (OpenAPI 3) — import it into
Postman, Insomnia or Swagger UI, or give it to a code generator.

## 3. Responses

Success:

\`\`\`json
{ "success": true, "data": { … } }
\`\`\`

Lists return \`data.items\` and \`data.pagination\`:

\`\`\`json
{ "success": true, "data": { "items": [ … ], "pagination": { "page": 1, "limit": 12, "total": 40, "totalPages": 4 } } }
\`\`\`

Use \`?page=1&limit=12\` on lists (\`limit\` at most 25). Dates are ISO 8601
(UTC). Image URLs are absolute, ready for \`<img src>\`.

Errors:

\`\`\`json
{ "success": false, "code": "INVALID_API_KEY", "message": "Invalid API key" }
\`\`\`

| HTTP | code | Meaning |
|---|---|---|
${WEBSITE_API_ERRORS.map(([status, code, meaning]) => `| ${status} | \`${code}\` | ${meaning} |`).join("\n")}

## 4. Read endpoints (GET)

| Endpoint | Returns |
|---|---|
${WEBSITE_API_ENDPOINTS.map(
  ([resource, label, detail, about]) =>
    `| \`GET /${resource}\`${detail ? `<br>\`GET /${resource}/{id}\`` : ""} | **${label}.** ${about} |`
).join("\n")}

### Main fields

- **/school** — \`id, name, principalName, location, address{province,
  district, municipality, ward, tole, street, postalCode}, phone, email,
  website, establishedYear, logoUrl, bannerUrl, praavyoProfileUrl,
  admissionOpen, admission{status, acceptingFor, notice}, showcase{tagline,
  summary, motto, socialLinks, highlights, metrics}\`
- **/notices** — \`id, title, content, excerpt, type, priority, publishedAt,
  expiryDate\`
- **/events** — \`id, title, description, excerpt, date, kind
  (COMPETITION | PROGRAM), type, status, venue, registrationDeadline,
  resultsPublished, eligibleGrades\`
- **/writings** — \`id, title, contentText, excerpt, category, tags,
  authorName, authorGrade, publishedAt, featured, coverImageUrl\`; the detail
  adds \`blocks\` and \`images[{url, caption, altText}]\`
- **/magazines** — \`id, title, weekStart, weekEnd, weekNumber, month, year,
  publishedAt, articleCount\`; the detail adds \`articles\` (full writings)
- **/gallery** — \`id, title, description, takenOn, publishedAt, coverUrl,
  photoCount\`; the detail adds \`photos[{id, url, caption, width, height}]\`
- **/achievements** — \`id, title, description, recipientType, recipientName,
  level, placement, awardedAt\`
- **/admission** — \`status (OPEN | CLOSED), acceptingFor (THIS_YEAR |
  NEXT_YEAR), notice, academicYear, grades, deadline, note, form\`

### Formatted text (\`blocks\`)

Writings come with \`blocks\`, so you can show headings, lists, bold, italic
and links **without inserting HTML** (safe against script injection):

\`\`\`
{ type: "heading" | "paragraph", inline: Node[] }
{ type: "bullets", items: Node[][] }
{ type: "numbers", start, items: Node[][] }
Node = { type: "text", text }
     | { type: "bold" | "italic" | "highlight", children: Node[] }
     | { type: "link", href, children: Node[] }   (http, https, mailto only)
\`\`\`

Paragraph text keeps its line breaks: render with \`white-space: pre-line\`.
Build elements and set text content; do not use \`innerHTML\` with API text.
\`contentText\` is the same writing as plain text.

## 5. Forms

Build both forms from \`GET /forms\` so they always match what Praavyo
accepts (fields can change; grade options are the school's own grades):

\`\`\`
{ general:   { type: "GENERAL",   fields: [ … ], honeypot },
  admission: { type: "ADMISSION", status, acceptingFor, notice, fields: [ … ], honeypot } }
\`\`\`

Each field: \`name, label, type\` (text, email, tel, date-text, select,
textarea), \`required, minLength, maxLength, options\` (select),
\`placeholder, help\`.

### General inquiry

${FIELD_HEAD}
${fieldRows(GENERAL_INQUIRY_FIELDS)}

### Admission application

${FIELD_HEAD}
${fieldRows(admissionFields(["the school's grades (from GET /forms)"]))}

**Spam trap:** add a hidden field named \`${HONEYPOT_FIELD}\` and send it
empty. People never see it; bots fill it, and those submissions are dropped.

**Admission season:** keep the admission form on the website all year.
While \`status\` is \`CLOSED\`, show \`notice\` above the form (“closed for
this year, you can still apply for next year”); applications are still
accepted and answer \`data.forNextYear: true\`.

## 6. Send a form (POST /inquiries)

\`\`\`http
POST ${apiBase}/inquiries
Authorization: Bearer <API key>
Content-Type: application/json
X-Visitor-IP: <the visitor's IP address>

{ "type": "GENERAL", "name": "Sita Sharma", "email": "sita@gmail.com",
  "phone": "9841234567", "subject": "School bus routes",
  "message": "Does the school bus come to Baneshwor?" }
\`\`\`

\`\`\`json
{ "type": "ADMISSION", "studentName": "Aarav Sharma", "grade": "Grade 3",
  "guardianName": "Sita Sharma", "phone": "9841234567" }
\`\`\`

Success is \`201\` with \`{ success: true, message, data }\` — show \`message\`
to the visitor. On \`400\`/\`429\` show the error \`message\`.

Send \`X-Visitor-IP\`: each visitor may then send 5 forms an hour. Without it
the whole website shares 60 an hour. A school receives at most 60 an hour.

## 7. Limits and caching

- 600 requests per minute per key.
- Content changes rarely: cache GET answers on your server for about a
  minute (Praavyo marks them \`Cache-Control: private, max-age=60\`). Do not
  cache \`/admission\` and \`/forms\` for long — the season can switch at any
  time. Keep the last good copy and serve it if Praavyo is unreachable.
- Timeouts of about 10 seconds are recommended.

## 8. What appears where (managed by the school in Praavyo)

| Website shows | Comes from Praavyo |
|---|---|
| Notices | Notices ticked “Also show on our school website” |
| Events | School events and programs |
| Student writings | Writings on the school wall (Publishing Desk) and in published magazines |
| School magazine | Published magazine issues |
| Gallery | Albums set to Public in Gallery |
| Admission | Settings → Admission (open / closed, grades, deadline) |
| Contact / Admission forms | Arrive in Inquiries, marked “Through website” |

## 9. Go-live checklist

- [ ] Key stored on the server only (env variable / private config); not in
      browser code or git.
- [ ] \`GET /school\` works from the production server.
- [ ] Forms are built from \`GET /forms\`, include the hidden \`${HONEYPOT_FIELD}\`
      field, and show the API's \`message\` after sending.
- [ ] \`X-Visitor-IP\` is sent with every form.
- [ ] A test inquiry appears in Praavyo → Inquiries as “Through website”.
- [ ] API text is rendered as text (no \`innerHTML\`).
- [ ] GET answers are cached about a minute; errors show a friendly message.
`;
}

/** OpenAPI 3.0 description of the Website API (openapi.json in the kit). */
export function websiteApiOpenApi({ apiBase, schoolName = "" }) {
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
  const json = (schema) => ({ "application/json": { schema } });
  const errors = {
    401: { description: "Missing or invalid API key", content: json(ref("Error")) },
    429: { description: "Rate limited", content: json(ref("Error")) },
    500: { description: "Server error", content: json(ref("Error")) },
  };
  const ok = (schema) => ({
    description: "OK",
    content: json({ type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: schema } }),
  });
  const pageParams = [
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 25, default: 12 } },
  ];
  const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };
  const list = (item) => ({
    type: "object",
    properties: { items: { type: "array", items: item }, pagination: ref("Pagination") },
  });
  const notFound = { 404: { description: "Not found", content: json(ref("Error")) } };

  const paths = {};
  for (const [resource, label, detail, about] of WEBSITE_API_ENDPOINTS) {
    const schemaName = {
      school: "School",
      notices: "Notice",
      events: "Event",
      writings: "Writing",
      magazines: "Magazine",
      gallery: "Album",
      achievements: "Achievement",
      admission: "Admission",
      forms: "Forms",
    }[resource];
    const isList = !["school", "admission", "forms"].includes(resource);
    paths[`/${resource}`] = {
      get: {
        operationId: `get_${resource}`,
        summary: label,
        description: about,
        tags: ["Read"],
        ...(isList ? { parameters: pageParams } : {}),
        responses: { 200: ok(isList ? list(ref(schemaName)) : ref(schemaName)), ...errors },
      },
    };
    if (detail) {
      paths[`/${resource}/{id}`] = {
        get: {
          operationId: `get_${resource}_by_id`,
          summary: `${label} — one item`,
          tags: ["Read"],
          parameters: [idParam],
          responses: { 200: ok(ref(`${schemaName}Detail`)), ...notFound, ...errors },
        },
      };
    }
  }
  paths["/inquiries"] = {
    post: {
      operationId: "send_inquiry",
      summary: "Send a general inquiry or an admission application",
      description:
        "Arrives in the school's Praavyo Inquiries, marked “Through website”. Send the visitor's IP in X-Visitor-IP (5 per visitor per hour; without it 60 per website per hour).",
      tags: ["Send"],
      parameters: [{ name: "X-Visitor-IP", in: "header", schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: json({ oneOf: [ref("GeneralInquiry"), ref("AdmissionApplication")], discriminator: { propertyName: "type" } }),
      },
      responses: {
        201: {
          description: "Received",
          content: json({
            type: "object",
            properties: {
              success: { type: "boolean", enum: [true] },
              message: { type: "string" },
              data: { type: "object", properties: { forNextYear: { type: "boolean" } } },
            },
          }),
        },
        400: { description: "Invalid form (VALIDATION_ERROR, GRADE_NOT_OPEN)", content: json(ref("Error")) },
        ...errors,
      },
    },
  };

  const str = { type: "string" };
  const date = { type: "string", format: "date-time", nullable: true };
  const strings = { type: "array", items: str };
  const obj = (properties) => ({ type: "object", properties });
  const fieldProps = (fields) =>
    Object.fromEntries(
      fields.map((field) => [
        field.name,
        {
          type: "string",
          ...(field.maxLength ? { maxLength: field.maxLength } : {}),
          ...(field.minLength ? { minLength: field.minLength } : {}),
          ...(field.options?.length ? { enum: field.options } : {}),
          description: field.label,
        },
      ])
    );
  const required = (fields) => fields.filter((field) => field.required).map((field) => field.name);
  const admission = admissionFields([]);

  const writing = obj({
    id: str, title: str, content: str, contentText: str, excerpt: str, category: str, tags: strings,
    authorName: str, authorGrade: str, publishedAt: date, featured: { type: "boolean" }, coverImageUrl: str,
  });
  const writingDetail = {
    allOf: [
      writing,
      obj({
        blocks: { type: "array", items: { type: "object" }, description: "Formatted text; see README §4." },
        images: { type: "array", items: obj({ url: str, caption: str, altText: str }) },
      }),
    ],
  };
  const magazine = obj({
    id: str, title: str, weekStart: date, weekEnd: date, weekNumber: { type: "integer" }, month: { type: "integer" },
    year: { type: "integer" }, publishedAt: date, articleCount: { type: "integer" },
  });
  const album = obj({
    id: str, title: str, description: str, takenOn: date, publishedAt: date, coverUrl: str, photoCount: { type: "integer" },
  });
  const notice = obj({ id: str, title: str, content: str, excerpt: str, type: str, priority: str, publishedAt: date, expiryDate: date });
  const event = obj({
    id: str, title: str, description: str, excerpt: str, date, kind: { type: "string", enum: ["COMPETITION", "PROGRAM"] },
    type: str, status: str, venue: str, registrationDeadline: date, resultsPublished: { type: "boolean" }, eligibleGrades: strings,
  });
  const field = obj({
    name: str, label: str, type: { type: "string", enum: ["text", "email", "tel", "date-text", "select", "textarea"] },
    required: { type: "boolean" }, minLength: { type: "integer" }, maxLength: { type: "integer" }, options: strings,
    placeholder: str, help: str,
  });
  const admissionForm = obj({
    type: { type: "string", enum: ["ADMISSION"] }, status: { type: "string", enum: ["OPEN", "CLOSED"] },
    acceptingFor: { type: "string", enum: ["THIS_YEAR", "NEXT_YEAR"] }, notice: str,
    fields: { type: "array", items: field }, honeypot: obj({ name: str, note: str }),
  });

  return {
    openapi: "3.0.3",
    info: {
      title: schoolName ? `${schoolName} — Praavyo Website API` : "Praavyo Website API",
      version: "1.0.0",
      description:
        "Read a school's public Praavyo content and send its website's contact and admission forms. Authenticate with the school's API key as a Bearer token, from the website's server only.",
    },
    servers: [{ url: apiBase }],
    security: [{ bearerAuth: [] }],
    tags: [{ name: "Read" }, { name: "Send" }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "prv_school_live_…", description: "The school's Website API key." },
      },
      schemas: {
        Error: obj({ success: { type: "boolean", enum: [false] }, code: str, message: str }),
        Pagination: obj({ page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } }),
        School: obj({
          id: str, name: str, principalName: str, location: str,
          address: obj({ province: str, district: str, municipality: str, ward: str, tole: str, street: str, postalCode: str }),
          phone: str, email: str, website: str, establishedYear: { type: "integer", nullable: true }, logoUrl: str, bannerUrl: str,
          praavyoProfileUrl: str, admissionOpen: { type: "boolean" },
          admission: obj({ status: { type: "string", enum: ["OPEN", "CLOSED"] }, acceptingFor: { type: "string", enum: ["THIS_YEAR", "NEXT_YEAR"] }, notice: str }),
          showcase: { ...obj({ tagline: str, summary: str, motto: str, logoUrl: str, contactEmail: str, socialLinks: { type: "object" }, highlights: { type: "array", items: {} }, metrics: { type: "object" } }), nullable: true },
        }),
        Notice: notice,
        NoticeDetail: notice,
        Event: event,
        EventDetail: event,
        Writing: writing,
        WritingDetail: writingDetail,
        Magazine: magazine,
        MagazineDetail: { allOf: [magazine, obj({ articles: { type: "array", items: writingDetail } })] },
        Album: album,
        AlbumDetail: {
          allOf: [album, obj({ photos: { type: "array", items: obj({ id: str, url: str, caption: str, width: { type: "integer" }, height: { type: "integer" } }) } })],
        },
        Achievement: obj({ id: str, title: str, description: str, recipientType: str, recipientName: str, level: str, placement: str, awardedAt: date }),
        Admission: obj({
          status: { type: "string", enum: ["OPEN", "CLOSED"] }, acceptingFor: { type: "string", enum: ["THIS_YEAR", "NEXT_YEAR"] },
          notice: str, academicYear: str, grades: strings, deadline: date, note: str, form: admissionForm,
        }),
        Forms: obj({
          general: obj({ type: { type: "string", enum: ["GENERAL"] }, fields: { type: "array", items: field }, honeypot: obj({ name: str, note: str }) }),
          admission: admissionForm,
        }),
        GeneralInquiry: {
          type: "object",
          required: ["type", ...required(GENERAL_INQUIRY_FIELDS)],
          properties: { type: { type: "string", enum: ["GENERAL"] }, ...fieldProps(GENERAL_INQUIRY_FIELDS), [HONEYPOT_FIELD]: { type: "string", maxLength: 0, description: "Hidden spam trap; send empty." } },
        },
        AdmissionApplication: {
          type: "object",
          required: ["type", ...required(admission)],
          properties: { type: { type: "string", enum: ["ADMISSION"] }, ...fieldProps(admission), [HONEYPOT_FIELD]: { type: "string", maxLength: 0, description: "Hidden spam trap; send empty." } },
        },
      },
    },
  };
}
