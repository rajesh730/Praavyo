"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy as FiCopy, Download, Globe, Key as FiKey, Plus as FiPlus, Trash2 as FiTrash2 } from "lucide-react";
import { GENERAL_INQUIRY_FIELDS, HONEYPOT_FIELD, admissionFields } from "@/lib/inquiryForms";
import { KEY_PLACEHOLDER, WEBSITE_API_ENDPOINTS, websiteApiGuide } from "@/lib/websiteApiGuide";

// Step by step, what the school does to connect its own website.
const CONNECT_STEPS = [
  ["Create an API key", "One key per website, below. Praavyo shows it only once."],
  ["Download the API kit", "Manual, OpenAPI spec, .env with the key and example code (PHP, Node.js, cURL)."],
  ["Send it to your developer privately", "Never in a public group or post. They build the website; you keep publishing here."],
];

function FieldTable({ title, fields }) {
  return (
    <div className="mt-4 overflow-hidden rounded-card border border-line-strong">
      <p className="border-b border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink">{title}</p>
      <div className="table-wrap">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Field</th>
              <th className="px-3 py-2 font-semibold">Label</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Required</th>
              <th className="px-3 py-2 font-semibold">Rules</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {fields.map((field) => (
              <tr key={field.name}>
                <td className="px-3 py-2"><code className="text-ink">{field.name}</code></td>
                <td className="px-3 py-2 text-ink">{field.label}</td>
                <td className="px-3 py-2 text-body">{field.type}</td>
                <td className="px-3 py-2 text-body">{field.required ? "Yes" : "No"}</td>
                <td className="px-3 py-2 text-muted">
                  {[
                    field.minLength ? `min ${field.minLength}` : "",
                    field.maxLength ? `max ${field.maxLength}` : "",
                    field.options ? field.options.join(" / ") : "",
                  ].filter(Boolean).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function WebsiteApiKeysPanel() {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("Official school website");
  const [newKey, setNewKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState("");
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/school/settings/api-keys", {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Could not load API keys");
      setKeys(json.data || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOrigin(window.location.origin);
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const apiBase = `${origin || "https://www.praavyo.com"}/api/v1/website`;
  const exampleKey = newKey || KEY_PLACEHOLDER;
  const envExample = `PRAAVYO_API_URL=${apiBase}\nPRAAVYO_API_KEY=${exampleKey}`;
  const curlExample = `curl "${apiBase}/notices?page=1&limit=10" \\\n  -H "Authorization: Bearer ${exampleKey}"`;
  const javascriptExample = `const response = await fetch(
  \`\${process.env.PRAAVYO_API_URL}/notices?page=1&limit=10\`,
  {
    headers: {
      Authorization: \`Bearer \${process.env.PRAAVYO_API_KEY}\`,
    },
  }
);

if (!response.ok) throw new Error(\`Praavyo API: \${response.status}\`);
const { data } = await response.json();
console.log(data.items);`;
  const inquiryExample = `// On your website's server, when the contact or admission form is sent:
await fetch(\`\${process.env.PRAAVYO_API_URL}/inquiries\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.PRAAVYO_API_KEY}\`,
    "Content-Type": "application/json",
    "X-Visitor-IP": visitorIp, // the visitor's IP, for fair rate limits
  },
  body: JSON.stringify({
    type: "GENERAL", // or "ADMISSION"
    name: "Sita Sharma",
    email: "sita@gmail.com",
    phone: "9841234567",
    subject: "School bus routes",
    message: "Does the school bus come to Baneshwor?",
  }),
});

// Admission (always accepted; while closed it is for next year and the
// answer is { data: { forNextYear: true } }):
// { type: "ADMISSION", studentName, grade, guardianName, phone,
//   dateOfBirth?, gender?, previousSchool?, guardianRelation?,
//   email?, address?, message? }
// Build both forms from GET /forms so the fields always match.`;

  const fullGuide = websiteApiGuide({ apiBase, apiKey: exampleKey });

  const create = async () => {
    setBusy(true);
    setMessage("");
    setNewKey("");
    try {
      const response = await fetch("/api/school/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Could not create API key");
      setNewKey(json.data.apiKey);
      setMessage("API key created. Copy it now; Praavyo will not show it again.");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id) => {
    if (!window.confirm("Revoke this API key? The connected website will stop updating.")) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/school/settings/api-keys/${id}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Could not revoke API key");
      await load();
      setMessage("API key revoked.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  // The developer kit: manual, OpenAPI spec, .env and example clients. Uses
  // the key created just now, or asks the server to create one for it.
  const downloadKit = async () => {
    setDownloading(true);
    setMessage("");
    try {
      const response = await fetch("/api/school/settings/api-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newKey ? { apiKey: newKey } : {}),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.message || "The API kit could not be prepared.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || "praavyo-api.zip";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        newKey
          ? "API kit downloaded with the key you just created. Send it to your website developer privately."
          : "API kit downloaded. A key named \"Developer kit\" was created for it. Send the kit to your website developer privately."
      );
      if (!newKey) await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setDownloading(false);
    }
  };

  const copyText = async (text, successMessage = "Copied.") => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(successMessage);
    } catch {
      setMessage("Copy failed. Select the text and copy it manually.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Connect the school's own website through the API */}
      <section className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-soft text-lg text-brand-strong">
              <Globe aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink">Connect your school website</h2>
              <p className="mt-0.5 max-w-2xl text-sm text-muted">
                Your website developer connects through the Praavyo API with two things: the API URL and a secret
                API key. The website then shows what you publish here and sends its contact and admission forms to
                Inquiries, marked “Through website”.
              </p>
            </div>
          </div>
          <button type="button" onClick={downloadKit} disabled={downloading} className="btn btn-primary shrink-0">
            <Download aria-hidden /> {downloading ? "Preparing…" : "Download API kit"}
          </button>
        </div>
        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          {CONNECT_STEPS.map(([step, detail], index) => (
            <li key={step} className="rounded-control border border-line bg-surface-2 px-3 py-2">
              <p className="font-semibold text-ink">{index + 1}. {step}</p>
              <p className="mt-0.5 text-xs text-muted">{detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-card bg-brand-soft p-3 text-brand">
            <FiKey className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-ink">Website API keys</h2>
            <p className="mt-1 text-sm text-subtle">
              Connect any website to your public Praavyo content and inquiries.
              Store the key on the website server, never in browser code.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            aria-label="API key name"
            className="input flex-1"
          />
          <button
            type="button"
            onClick={create}
            disabled={busy || !name.trim()}
            className="btn btn-secondary inline-flex items-center justify-center gap-2 font-semibold"
          >
            <FiPlus /> {busy ? "Please wait..." : "Create API key"}
          </button>
        </div>

        {newKey ? (
          <div className="mt-4 rounded-card border border-warning-line bg-warning-soft p-4">
            <p className="text-sm font-semibold text-warning">Copy this key now</p>
            <div className="mt-2 flex gap-2">
              <input readOnly value={newKey} className="input min-w-0 flex-1" />
              <button
                type="button"
                onClick={() => copyText(newKey, "API key copied.")}
                className="btn-icon btn-soft flex items-center justify-center"
                aria-label="Copy API key"
              >
                <FiCopy />
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">“Download API kit” will include this key.</p>
          </div>
        ) : null}

        {message ? <p className="mt-3 text-sm text-ink" role="status">{message}</p> : null}

        <div className="mt-5 space-y-2">
          {loading ? <p className="text-sm text-subtle">Loading keys...</p> : null}
          {!loading && keys.length === 0 ? (
            <p className="rounded-card border border-dashed border-line-strong p-4 text-sm text-subtle">
              No website API keys yet.
            </p>
          ) : null}
          {keys.map((key) => (
            <div
              key={key._id}
              className="flex items-center gap-3 rounded-card border border-line-strong bg-surface px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{key.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {key.prefix}••••{key.lastFour} · {key.revokedAt ? "Revoked" : "Active"}
                  {key.lastUsedAt
                    ? ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                    : " · Never used"}
                </p>
              </div>
              {!key.revokedAt ? (
                <button
                  type="button"
                  onClick={() => revoke(key._id)}
                  disabled={busy}
                  className="btn-icon btn-ghost flex items-center justify-center"
                  aria-label={`Revoke ${key.name}`}
                >
                  <FiTrash2 />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-line-strong pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-semibold text-ink">Developer handoff</h3>
              <p className="mt-1 text-sm text-subtle">
                Everything a website developer or coding AI needs to connect.
              </p>
            </div>
            <button
              type="button"
              onClick={() => copyText(fullGuide, "Complete integration guide copied.")}
              className="btn btn-secondary inline-flex items-center justify-center gap-2 font-semibold"
            >
              <FiCopy /> Copy complete guide
            </button>
          </div>

          <InfoBlock
            title="API base URL"
            value={apiBase}
            onCopy={() => copyText(apiBase, "API base URL copied.")}
          />

          <div className="mt-4 overflow-hidden rounded-card border border-line-strong">
            <div className="border-b border-line-strong bg-surface px-4 py-3">
              <p className="text-sm font-semibold text-ink">Available endpoints</p>
              <p className="mt-0.5 text-xs text-muted">
                Add <code>?page=1&amp;limit=12</code> to list endpoints. Maximum 25.
              </p>
            </div>
            {WEBSITE_API_ENDPOINTS.map(([resource, label, detail]) => {
              const endpoint = `${apiBase}/${resource}`;
              return (
                <div
                  key={resource}
                  className="flex items-center gap-3 border-b border-line-strong px-4 py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">{label}</p>
                    <code className="block truncate text-xs text-ink">GET {endpoint}</code>
                    {detail ? <code className="block truncate text-xs text-muted">GET {endpoint}/&lt;id&gt;</code> : null}
                  </div>
                  <CopyButton
                    label={`Copy ${label} endpoint`}
                    onClick={() => copyText(endpoint, `${label} endpoint copied.`)}
                  />
                </div>
              );
            })}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">Send a general or admission inquiry</p>
                <code className="block truncate text-xs text-ink">POST {apiBase}/inquiries</code>
              </div>
              <CopyButton
                label="Copy inquiries endpoint"
                onClick={() => copyText(`${apiBase}/inquiries`, "Inquiries endpoint copied.")}
              />
            </div>
          </div>

          <CodeBlock
            title="1. Website server environment (.env)"
            code={envExample}
            onCopy={() => copyText(envExample, "Environment configuration copied.")}
          />
          <CodeBlock
            title="2. Test with cURL"
            code={curlExample}
            onCopy={() => copyText(curlExample, "cURL example copied.")}
          />
          <CodeBlock
            title="3. Server-side JavaScript (read)"
            code={javascriptExample}
            onCopy={() => copyText(javascriptExample, "JavaScript example copied.")}
          />
          <FieldTable title="General inquiry form (GET /forms → general)" fields={GENERAL_INQUIRY_FIELDS} />
          <FieldTable
            title="Admission form (GET /forms → admission; grade options are your school's grades)"
            fields={admissionFields(["Your grades"])}
          />
          <p className="mt-2 text-xs text-muted">
            Also send a hidden field named <code>{HONEYPOT_FIELD}</code>, left empty (spam trap). While admissions are
            closed the form stays on the website with the notice from <code>GET /admission</code>, and applications are
            taken for next year.
          </p>

          <CodeBlock
            title="4. Send an inquiry or admission application"
            code={inquiryExample}
            onCopy={() => copyText(inquiryExample, "Inquiry example copied.")}
          />

          <div className="mt-4 rounded-card border border-brand-line bg-brand-soft p-4 text-xs leading-5 text-ink">
            The API key identifies this school automatically. Do not add a school ID
            to requests. Only approved public content is returned. The only write is
            POST /inquiries, which lands in your Inquiries as “Through website”.
          </div>
        </div>
      </section>
    </div>
  );
}

function CopyButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-icon btn-ghost flex shrink-0 items-center justify-center"
      aria-label={label}
    >
      <FiCopy />
    </button>
  );
}

function InfoBlock({ title, value, onCopy }) {
  return (
    <div className="mt-4 rounded-card border border-line-strong bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-subtle">{title}</p>
          <code className="mt-1 block break-all text-xs text-ink">{value}</code>
        </div>
        <CopyButton label={`Copy ${title}`} onClick={onCopy} />
      </div>
    </div>
  );
}

function CodeBlock({ title, code, onCopy }) {
  return (
    <div className="mt-4 overflow-hidden rounded-card border border-line-strong">
      <div className="flex items-center justify-between bg-surface px-4 py-2">
        <p className="text-xs font-semibold text-ink">{title}</p>
        <CopyButton label={`Copy ${title}`} onClick={onCopy} />
      </div>
      <pre className="overflow-x-auto bg-surface p-4 text-xs leading-5 text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}
