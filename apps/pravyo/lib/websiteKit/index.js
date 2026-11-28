import { SITE_CSS } from "./siteCss.js";
import { SITE_JS } from "./siteJs.js";
import { API_PHP, HTACCESS, SERVER_JS, configPhp, envFile } from "./connectors.js";
import { buildZip } from "../zipStore.js";

/**
 * The website Praavyo generates for a school (Settings → Website → Download
 * website): a ready-to-upload site that reads the school's public Praavyo
 * content through the Website API and sends its contact and admission forms
 * back to the school's Inquiries (source WEBSITE).
 *
 *   index.html, assets/site.css, assets/site.js   the website (any host)
 *   api.php + config.php                          connector for PHP / cPanel
 *   server.js + .env                              connector for Node.js
 *   .htaccess                                     keeps the private files private
 *   README.txt                                    how to put it online
 *
 * The API key is only ever written into config.php and .env (server side).
 */

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

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

export function indexHtml({ schoolName, description = "", version = new Date().toISOString().slice(0, 10).replace(/-/g, "") }) {
  const name = escapeHtml(schoolName || "Our School");
  // Changes with each download, so browsers fetch the new files after an update.
  const v = encodeURIComponent(version);
  const about = escapeHtml(description || `${schoolName || "Our school"}: notices, events, student writings, gallery and admission.`);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}</title>
  <meta name="description" content="${about}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/site.css?v=${v}">
</head>
<body>
  <a class="sr-only" href="#app">Skip to content</a>
  <div class="ribbon" id="ribbon" hidden></div>
  <header class="site-header">
    <div class="container">
      <a class="brand" href="#/">
        <img id="brand-logo" alt="" hidden>
        <span id="brand-name">${name}</span>
      </a>
      <button class="nav-toggle" id="nav-toggle" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
      <nav class="nav" id="nav" aria-label="Main">
        <a href="#/" data-nav="">Home</a>
        <a href="#/about" data-nav="about">About</a>
        <div class="dropdown">
          <button type="button" aria-expanded="false" data-nav="school-life">School life <span class="chev" aria-hidden="true">&#9662;</span></button>
          <div class="menu">
            <a href="#/events">Events</a>
            <a href="#/notices">Notices</a>
            <a href="#/writings">Student writings</a>
            <a href="#/magazine">School magazine</a>
            <a href="#/gallery">Gallery</a>
          </div>
        </div>
        <a href="#/admission" id="nav-admission" data-nav="admission">Admission</a>
        <a href="#/contact" data-nav="contact">Contact</a>
      </nav>
    </div>
  </header>

  <main id="app" tabindex="-1"></main>

  <footer class="site-footer">
    <div class="container">
      <div class="cols">
        <div>
          <h4 id="footer-name">${name}</h4>
          <p id="footer-about"></p>
        </div>
        <div>
          <h4>School life</h4>
          <ul>
            <li><a href="#/events">Events</a></li>
            <li><a href="#/notices">Notices</a></li>
            <li><a href="#/writings">Student writings</a></li>
            <li><a href="#/magazine">School magazine</a></li>
            <li><a href="#/gallery">Gallery</a></li>
          </ul>
        </div>
        <div>
          <h4>Contact</h4>
          <ul id="footer-contact"></ul>
          <p style="margin-top:12px"><a href="#/contact">Send us a message</a></p>
        </div>
      </div>
      <div class="fine">
        <span>&copy; <span id="year"></span> ${name}</span>
        <span>Connected with <a id="praavyo-link" href="https://www.praavyo.com" target="_blank" rel="noopener">Praavyo</a></span>
      </div>
    </div>
  </footer>
  <script src="assets/site.js?v=${v}" defer></script>
</body>
</html>
`;
}

export function readme({ schoolName, apiUrl }) {
  return `${schoolName || "School"} website, connected to Praavyo
${"=".repeat(Math.min(70, String(schoolName || "School").length + 35))}

This folder is a complete website for your school. It shows what you publish
in Praavyo (notices, events, student writings, school magazine, gallery) and
sends its Contact and Admission forms to your Praavyo dashboard → Inquiries,
marked "Through website".

Your API key is already filled in (config.php and .env). Keep those files
private. If the key is ever shared by mistake, revoke it in Praavyo
(Settings → Website) and download the website again.


PUT IT ONLINE — ordinary hosting (cPanel, PHP)
----------------------------------------------
1. Open your hosting's File Manager and go to public_html (or your domain's
   folder).
2. Upload everything in this folder, including the hidden .htaccess file.
3. Check the connection: open https://YOUR-DOMAIN/api.php?path=school
   You should see your school's details. Then open https://YOUR-DOMAIN/
That's all. The PHP curl extension (on by default almost everywhere) is used
when available.

PUT IT ONLINE — Node.js hosting or your own computer
----------------------------------------------------
1. Install Node.js 18 or newer.
2. In this folder run:   node server.js
3. Open http://localhost:3000   (set PORT in .env to change the port)
api.php and config.php are not needed on Node hosting.


HOW THINGS APPEAR ON THE WEBSITE
--------------------------------
- Notices: Praavyo notices whose visibility is Public.
- Events: your public school events.
- Student writings: writings published on your school wall.
- School magazine: published magazine issues and their articles.
- Gallery: albums you make Public in Praavyo → Gallery.
- Admission: turn the admission season on or off in Praavyo → Settings →
  Admission. The website shows the form only while it is open.
Changes in Praavyo show on the website within about a minute.


CHANGE THE LOOK
---------------
Colours are at the top of assets/site.css (--accent is the main colour).
The menu and footer text are in index.html.
Do not put the API key in assets/site.js or index.html: browsers can read
those files.


FOR DEVELOPERS
--------------
Website API: ${apiUrl}
Authorization: Bearer <API key>   (server side only)

GET  /school          school profile, logo, contact, admissionOpen
GET  /notices         ?page=1&limit=12 (max 25)   GET /notices/<id>
GET  /events          GET /events/<id>
GET  /writings        GET /writings/<id>   (blocks = formatted text)
GET  /magazines       GET /magazines/<id>  (issue with its articles)
GET  /gallery         GET /gallery/<id>    (album with its photos)
GET  /achievements
GET  /admission       isOpen, academicYear, grades, deadline, note, form
POST /inquiries       { "type": "GENERAL", name, email, phone, subject, message }
                      { "type": "ADMISSION", studentName, grade, guardianName,
                        phone, dateOfBirth?, gender?, previousSchool?,
                        guardianRelation?, email?, address?, message? }
                      Send the visitor's IP in the X-Visitor-IP header.
                      A closed admission season answers 409 ADMISSION_CLOSED.
`;
}

/** Every file of the website, ready to zip. */
export function websiteKitFiles({ schoolName, description, apiUrl, apiKey }) {
  const folder = `${slugify(schoolName)}-website`;
  const files = [
    ["index.html", indexHtml({ schoolName, description })],
    ["assets/site.css", SITE_CSS],
    ["assets/site.js", SITE_JS],
    ["api.php", API_PHP],
    ["config.php", configPhp({ apiUrl, apiKey })],
    ["server.js", SERVER_JS],
    [".env", envFile({ apiUrl, apiKey })],
    [".htaccess", HTACCESS],
    ["README.txt", readme({ schoolName, apiUrl })],
  ];
  return { folder, files: files.map(([name, content]) => ({ name: `${folder}/${name}`, content })) };
}

/** The website as a .zip Buffer and its file name. */
export function buildWebsiteKit(options) {
  const { folder, files } = websiteKitFiles(options);
  return { fileName: `${folder}.zip`, zip: buildZip(files) };
}
