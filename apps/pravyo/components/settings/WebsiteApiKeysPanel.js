"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy as FiCopy, Key as FiKey, Plus as FiPlus, Trash2 as FiTrash2 } from "lucide-react";

const RESOURCES = [
  ["School profile", "school"],
  ["Public notices", "notices"],
  ["Public events", "events"],
  ["Published writings", "writings"],
  ["Public achievements", "achievements"],
  ["Published magazines", "magazines"],
];

const cleanCurl = (value) => value.replace("\n+  -H", "\n  -H");

export default function WebsiteApiKeysPanel() {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("Official school website");
  const [newKey, setNewKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  const apiBase = `${origin}/api/v1/website`;
  const exampleKey = newKey || "YOUR_API_KEY";
  const envExample = `PRAVYO_API_URL=${apiBase || "https://your-pravyo-domain.com/api/v1/website"}\nPRAVYO_API_KEY=${exampleKey}`;
  const curlExample = `curl "${apiBase || "https://your-pravyo-domain.com/api/v1/website"}/notices?page=1&limit=10" \\\n+  -H "Authorization: Bearer ${exampleKey}"`;
  const javascriptExample = `const response = await fetch(
  \`\${process.env.PRAVYO_API_URL}/notices?page=1&limit=10\`,
  {
    headers: {
      Authorization: \`Bearer \${process.env.PRAVYO_API_KEY}\`,
    },
  }
);

if (!response.ok) throw new Error(\`Pravyo API: \${response.status}\`);
const { data } = await response.json();
console.log(data.items);`;

  const fullGuide = `PRAVYO WEBSITE API

Base URL: ${apiBase || "https://your-pravyo-domain.com/api/v1/website"}
Authentication header: Authorization: Bearer ${exampleKey}

Endpoints:
${RESOURCES.map(([label, resource]) => `- ${label}: GET /${resource}`).join("\n")}

Pagination: ?page=1&limit=12 (maximum 25)

.env
${envExample}

cURL
${curlExample}

Server-side JavaScript
${javascriptExample}`;

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

  const copyText = async (text, successMessage = "Copied.") => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(successMessage);
    } catch {
      setMessage("Copy failed. Select the text and copy it manually.");
    }
  };

  return (
    <section className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-card bg-brand-soft p-3 text-brand">
          <FiKey className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold text-ink">Website API</h2>
          <p className="mt-1 text-sm text-subtle">
            Connect your official website to approved public data in Praavyo.
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
          className="btn btn-primary inline-flex items-center justify-center gap-2 font-semibold"
        >
          <FiPlus /> {busy ? "Please wait..." : "Create API key"}
        </button>
      </div>

      {newKey ? (
        <div className="mt-4 rounded-card border border-warning bg-warning p-4">
          <p className="text-sm font-semibold text-warning">Copy this key now</p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={newKey}
              className="input min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={() => copyText(newKey, "API key copied.")}
              className="btn-icon btn-soft flex items-center justify-center"
              aria-label="Copy API key"
            >
              <FiCopy />
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-3 text-sm text-ink">{message}</p> : null}

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
            onClick={() =>
              copyText(cleanCurl(fullGuide), "Complete integration guide copied.")
            }
            className="btn btn-secondary inline-flex items-center justify-center gap-2 font-semibold"
          >
            <FiCopy /> Copy complete guide
          </button>
        </div>

        <InfoBlock
          title="API base URL"
          value={apiBase || "Loading API address..."}
          onCopy={() => copyText(apiBase, "API base URL copied.")}
        />

        <div className="mt-4 overflow-hidden rounded-card border border-line-strong">
          <div className="border-b border-line-strong bg-surface px-4 py-3">
            <p className="text-sm font-semibold text-ink">Available endpoints</p>
            <p className="mt-0.5 text-xs text-muted">
              Add <code>?page=1&amp;limit=12</code> to list endpoints. Maximum 25.
            </p>
          </div>
          {RESOURCES.map(([label, resource]) => {
            const endpoint = `${apiBase}/${resource}`;
            return (
              <div
                key={resource}
                className="flex items-center gap-3 border-b border-line-strong px-4 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">{label}</p>
                  <code className="block truncate text-xs text-ink">
                    GET {endpoint}
                  </code>
                </div>
                <CopyButton
                  label={`Copy ${label} endpoint`}
                  onClick={() => copyText(endpoint, `${label} endpoint copied.`)}
                />
              </div>
            );
          })}
        </div>

        <CodeBlock
          title="1. Website server environment (.env)"
          code={envExample}
          onCopy={() => copyText(envExample, "Environment configuration copied.")}
        />
        <CodeBlock
          title="2. Test with cURL"
          code={cleanCurl(curlExample)}
          onCopy={() => copyText(cleanCurl(curlExample), "cURL example copied.")}
        />
        <CodeBlock
          title="3. Server-side JavaScript"
          code={javascriptExample}
          onCopy={() => copyText(javascriptExample, "JavaScript example copied.")}
        />

        <div className="mt-4 rounded-card border border-brand bg-brand p-4 text-xs leading-5 text-white">
          The API key identifies this school automatically. Do not add a school ID
          to requests. Only approved public content is returned, and the API is
          read-only.
        </div>
      </div>
    </section>
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
