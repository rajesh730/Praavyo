// Server-side connectors of the generated school website (lib/websiteKit).
// They hold the API key and forward the site's requests to Praavyo, so the key
// never reaches visitors' browsers. Both answer the same URL, api.php?path=…,
// so the browser code works the same on PHP hosting and on Node.
// These live in String.raw templates: no backticks or dollar-brace inside.

export const API_PHP = String.raw`<?php
/*
 * Praavyo connector for this school website.
 * Forwards the website's requests to the Praavyo Website API and adds the
 * school's API key (from config.php) on the server. Visitors never see the key.
 *
 *   GET  api.php?path=notices&page=1&limit=12
 *   GET  api.php?path=notices/<id>
 *   POST api.php?path=inquiries   (JSON body)
 */
$config = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function praavyo_fail($status, $message) {
    http_response_code($status);
    echo json_encode(array('success' => false, 'message' => $message));
    exit;
}

$path = isset($_GET['path']) ? (string) $_GET['path'] : '';
if (!preg_match('#^[a-z]+(/[a-f0-9]{24})?$#', $path)) {
    praavyo_fail(400, 'Unknown path');
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
if ($method !== 'GET' && $method !== 'POST') praavyo_fail(405, 'Method not allowed');
if ($method === 'POST' && $path !== 'inquiries') praavyo_fail(405, 'Method not allowed');
if (empty($config['api_key']) || strpos($config['api_key'], 'prv_school_live_') !== 0) {
    praavyo_fail(500, 'The Praavyo API key is missing in config.php');
}

$query = array();
foreach (array('page', 'limit') as $name) {
    if (isset($_GET[$name]) && ctype_digit((string) $_GET[$name])) $query[$name] = $_GET[$name];
}
$url = rtrim($config['api_url'], '/') . '/' . $path . ($query ? '?' . http_build_query($query) : '');

// Answers are kept for a short while, so a busy website makes few calls to
// Praavyo, and the last good answer is shown if Praavyo cannot be reached.
$section = explode('/', $path);
$ttl = in_array($section[0], array('admission', 'forms', 'school'), true) ? 15 : 60;
$cacheFile = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'praavyo_' . md5($url . '|' . $config['api_key']) . '.json';
if ($method === 'GET' && is_file($cacheFile) && (time() - filemtime($cacheFile)) < $ttl) {
    header('Cache-Control: public, max-age=' . $ttl);
    header('X-Praavyo-Cache: HIT');
    readfile($cacheFile);
    exit;
}

$headers = array('Authorization: Bearer ' . $config['api_key'], 'Accept: application/json');
$body = null;
if ($method === 'POST') {
    $body = file_get_contents('php://input', false, null, 0, 20000);
    $headers[] = 'Content-Type: application/json';
    $headers[] = 'X-Visitor-IP: ' . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
}

$status = 502;
$response = false;
if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
} else {
    $context = stream_context_create(array('http' => array(
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $body === null ? '' : $body,
        'ignore_errors' => true,
        'timeout' => 20,
    )));
    $response = @file_get_contents($url, false, $context);
    if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s?#', $http_response_header[0], $match)) {
        $status = (int) $match[1];
    }
}

if ($response === false || $response === '' || $status === 0 || ($status >= 500 && $method === 'GET')) {
    // Praavyo unreachable: show the last good answer when there is one.
    if ($method === 'GET' && is_file($cacheFile)) {
        header('Cache-Control: no-store');
        header('X-Praavyo-Cache: STALE');
        readfile($cacheFile);
        exit;
    }
    praavyo_fail(502, 'Praavyo could not be reached. Please try again.');
}

http_response_code($status);
if ($method === 'GET' && $status === 200) {
    @file_put_contents($cacheFile, $response, LOCK_EX);
    header('Cache-Control: public, max-age=' . $ttl);
} else {
    header('Cache-Control: no-store');
}
echo $response;
`;

export function configPhp({ apiUrl, apiKey }) {
  const quote = (value) => `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  return `<?php
/*
 * Praavyo connection settings. Keep this file on the server only.
 * If the key is ever shared by mistake, revoke it in Praavyo
 * (Settings → Website) and create a new one.
 */
return array(
    'api_url' => ${quote(apiUrl)},
    'api_key' => ${quote(apiKey)},
);
`;
}

export const SERVER_JS = String.raw`/*
 * Praavyo connector for Node.js hosting (Node 18 or newer, no packages needed).
 *
 *   node server.js        then open http://localhost:3000
 *
 * Serves the website and forwards api.php?path=… to the Praavyo Website API,
 * adding the API key from .env on the server.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
try {
  fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/).forEach(function (line) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  });
} catch (error) {
  // No .env: use the environment's own variables.
}

const API_URL = String(process.env.PRAAVYO_API_URL || "").replace(/\/+$/, "");
const API_KEY = String(process.env.PRAAVYO_API_KEY || "");
const PORT = Number(process.env.PORT) || 3000;
const CACHE = new Map();
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };

function send(res, status, body, type, extra) {
  res.writeHead(status, Object.assign({ "Content-Type": type || "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" }, extra || {}));
  res.end(body);
}
function fail(res, status, message) { send(res, status, JSON.stringify({ success: false, message: message })); }

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > 20000) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", function () { resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
  });
}

async function proxy(req, res, url) {
  const target = url.searchParams.get("path") || "";
  if (!/^[a-z]+(\/[a-f0-9]{24})?$/.test(target)) return fail(res, 400, "Unknown path");
  if (req.method !== "GET" && req.method !== "POST") return fail(res, 405, "Method not allowed");
  if (req.method === "POST" && target !== "inquiries") return fail(res, 405, "Method not allowed");
  if (!API_URL || !API_KEY.startsWith("prv_school_live_")) return fail(res, 500, "Set PRAAVYO_API_URL and PRAAVYO_API_KEY in .env");

  const query = new URLSearchParams();
  ["page", "limit"].forEach(function (name) {
    const value = url.searchParams.get(name);
    if (value && /^\d+$/.test(value)) query.set(name, value);
  });
  const headers = { Authorization: "Bearer " + API_KEY, Accept: "application/json" };
  let body;
  if (req.method === "POST") {
    try { body = await readBody(req); } catch (error) { return fail(res, 413, "Too large"); }
    headers["Content-Type"] = "application/json";
    headers["X-Visitor-IP"] = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  }
  // Answers are kept for a short while, so a busy website makes few calls to
  // Praavyo, and the last good answer is shown if Praavyo cannot be reached.
  const upstreamUrl = API_URL + "/" + target + (query.toString() ? "?" + query : "");
  const ttl = ["admission", "forms", "school"].includes(target.split("/")[0]) ? 15000 : 60000;
  const cached = CACHE.get(upstreamUrl);
  if (req.method === "GET" && cached && Date.now() - cached.at < ttl) {
    return send(res, 200, cached.body, null, { "Cache-Control": "public, max-age=" + ttl / 1000, "X-Praavyo-Cache": "HIT" });
  }
  try {
    const upstream = await fetch(upstreamUrl, { method: req.method, headers: headers, body: body });
    const text = await upstream.text();
    if (req.method === "GET" && upstream.status >= 500 && cached) {
      return send(res, 200, cached.body, null, { "Cache-Control": "no-store", "X-Praavyo-Cache": "STALE" });
    }
    if (req.method === "GET" && upstream.status === 200) {
      CACHE.set(upstreamUrl, { body: text, at: Date.now() });
      if (CACHE.size > 500) CACHE.delete(CACHE.keys().next().value);
    }
    send(res, upstream.status, text, null, { "Cache-Control": req.method === "GET" && upstream.status === 200 ? "public, max-age=" + ttl / 1000 : "no-store" });
  } catch (error) {
    if (req.method === "GET" && cached) {
      return send(res, 200, cached.body, null, { "Cache-Control": "no-store", "X-Praavyo-Cache": "STALE" });
    }
    fail(res, 502, "Praavyo could not be reached. Please try again.");
  }
}

http.createServer(function (req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api.php") return void proxy(req, res, url);

  // Only the website's own files are served: never .env, config.php or this file.
  let file = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  if (file !== "index.html" && !file.startsWith("assets/")) file = "index.html";
  const full = path.join(ROOT, file);
  if (!full.startsWith(path.join(ROOT, "assets")) && full !== path.join(ROOT, "index.html")) return fail(res, 404, "Not found");
  fs.readFile(full, function (error, data) {
    if (error) return fail(res, 404, "Not found");
    send(res, 200, data, TYPES[path.extname(full)] || "application/octet-stream", { "Cache-Control": file === "index.html" ? "no-cache" : "public, max-age=3600" });
  });
}).listen(PORT, function () {
  console.log("School website running at http://localhost:" + PORT);
});
`;

export function envFile({ apiUrl, apiKey }) {
  return `# Praavyo connection settings for server.js. Keep this file private.
PRAAVYO_API_URL=${apiUrl}
PRAAVYO_API_KEY=${apiKey}
PORT=3000
`;
}

// Apache / cPanel: keep the private files private.
export const HTACCESS = `# Keep connection settings and server files private.
<FilesMatch "^(\\.env|config\\.php|server\\.js|README\\.txt)$">
  Require all denied
</FilesMatch>
Options -Indexes
`;
