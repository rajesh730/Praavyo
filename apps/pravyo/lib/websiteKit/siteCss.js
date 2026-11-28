// assets/site.css of the generated school website (lib/websiteKit).
// Plain CSS; schools change the look by editing the variables in :root.
export const SITE_CSS = String.raw`/* School website connected to Praavyo.
   Change the colours here: --accent is buttons, links and highlights. */
:root {
  --bg: #f6f3ec;
  --surface: #fdfbf7;
  --surface-2: #efebe2;
  --ink: #2f2c27;
  --body: #4d4943;
  --muted: #7a756c;
  --line: #e2ddd2;
  --accent: #2f6b4f;
  --accent-ink: #ffffff;
  --accent-soft: #e3efe8;
  --warn-soft: #fdf1dc;
  --danger: #b3261e;
  --danger-soft: #fbe9e7;
  --radius: 14px;
  --shadow: 0 10px 30px rgba(47, 44, 39, 0.10);
  --max: 1120px;
  font-family: "DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--body);
  background: var(--bg);
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); line-height: 1.6; font-size: 16px; overflow-wrap: anywhere; }
img { max-width: 100%; display: block; }
a { color: var(--accent); }
h1, h2, h3, h4 { color: var(--ink); line-height: 1.25; margin: 0 0 .5em; }
h1 { font-size: clamp(1.9rem, 4vw, 2.8rem); letter-spacing: -0.01em; }
h2 { font-size: clamp(1.4rem, 2.6vw, 1.9rem); }
h3 { font-size: 1.15rem; }
p { margin: 0 0 1em; }
.container { width: 100%; max-width: var(--max); margin: 0 auto; padding: 0 20px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Header and navigation */
.site-header { position: sticky; top: 0; z-index: 40; background: rgba(246, 243, 236, 0.94); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
.site-header .container { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 72px; }
.brand { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--ink); font-weight: 700; font-size: 1.05rem; min-width: 0; }
.brand img { width: 44px; height: 44px; object-fit: contain; border-radius: 10px; background: var(--surface); }
.brand span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav { display: flex; align-items: center; gap: 4px; }
.nav a, .nav button { font: inherit; color: var(--ink); text-decoration: none; background: none; border: 0; padding: 10px 14px; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.nav a:hover, .nav button:hover, .nav a.active, .nav button.active { background: var(--surface-2); }
.nav a.cta, .nav a.cta.active { background: var(--accent); color: var(--accent-ink); }
.nav a.cta:hover { background: var(--accent); filter: brightness(1.08); }
.dropdown { position: relative; }
.dropdown .chev { transition: transform .2s; font-size: .8em; }
.dropdown.open .chev { transform: rotate(180deg); }
.menu { position: absolute; top: calc(100% + 8px); left: 0; min-width: 240px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 8px; display: none; }
.dropdown.open .menu { display: block; }
.menu a { display: block; padding: 10px 14px; }
.nav-toggle { display: none; font: inherit; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; color: var(--ink); cursor: pointer; }
@media (max-width: 900px) {
  .nav-toggle { display: inline-flex; }
  .nav { display: none; position: absolute; top: 72px; left: 0; right: 0; background: var(--surface); border-bottom: 1px solid var(--line); flex-direction: column; align-items: stretch; padding: 10px 16px 18px; box-shadow: var(--shadow); }
  .nav.open { display: flex; }
  .menu { position: static; box-shadow: none; border: 0; padding: 0 0 0 12px; min-width: 0; background: transparent; }
}

/* Hero */
.hero { position: relative; color: #fff; background: var(--accent); background-size: cover; background-position: center; }
.hero::before { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20, 20, 18, .35), rgba(20, 20, 18, .62)); }
.hero .container { position: relative; padding: 88px 20px 72px; display: grid; gap: 18px; }
.hero h1 { color: #fff; max-width: 760px; }
.hero p { max-width: 640px; font-size: 1.1rem; color: rgba(255, 255, 255, .92); }
.hero .logo { width: 84px; height: 84px; border-radius: 18px; background: #fff; padding: 8px; object-fit: contain; }
.hero .motto { font-style: italic; opacity: .9; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; }

/* Buttons, chips, badges */
.btn { font: inherit; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 20px; border-radius: 12px; border: 1px solid transparent; cursor: pointer; text-decoration: none; transition: filter .15s, background .15s; }
.btn-primary { background: var(--accent); color: var(--accent-ink); }
.btn-primary:hover { filter: brightness(1.08); }
.btn-light { background: #fff; color: var(--ink); }
.btn-ghost { background: transparent; color: var(--ink); border-color: var(--line); }
.btn-ghost:hover { background: var(--surface-2); }
.btn[disabled] { opacity: .6; cursor: not-allowed; }
.chip { display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: .85rem; font-weight: 600; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: .78rem; font-weight: 600; background: var(--surface-2); color: var(--body); }
.badge-urgent { background: var(--danger-soft); color: var(--danger); }
.ribbon { background: var(--warn-soft); border-bottom: 1px solid var(--line); text-align: center; padding: 10px 16px; font-weight: 600; color: var(--ink); }
.ribbon a { margin-left: 8px; }

/* Sections and cards */
main { min-height: 60vh; }
main:focus { outline: none; }
.section { padding: 56px 0; }
.section + .section { padding-top: 0; }
.section-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.section-head p { margin: 0; color: var(--muted); }
.page-head { padding-top: 48px; padding-bottom: 8px; }
.page-head p { color: var(--muted); max-width: 680px; }
.grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; display: flex; flex-direction: column; text-decoration: none; color: inherit; transition: box-shadow .2s, transform .2s; }
a.card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
.card .cover { aspect-ratio: 16 / 10; object-fit: cover; width: 100%; background: var(--surface-2); }
.card .body { padding: 18px; display: grid; gap: 8px; }
.card h3 { margin: 0; }
.card p { margin: 0; color: var(--muted); font-size: .95rem; }
.meta { color: var(--muted); font-size: .88rem; display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
.row-card { display: flex; gap: 16px; padding: 18px; }
.date-tile { flex: none; width: 62px; text-align: center; border-radius: 12px; background: var(--accent-soft); color: var(--accent); padding: 8px 4px; line-height: 1.1; }
.date-tile b { display: block; font-size: 1.5rem; }
.date-tile span { font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; }
.stack { display: grid; gap: 14px; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 24px; }
.notice-closed { background: var(--warn-soft); border-color: #ecd3a4; }
.two-col { display: grid; gap: 24px; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); align-items: start; }
@media (max-width: 860px) { .two-col { grid-template-columns: minmax(0, 1fr); } }
.facts { display: grid; gap: 12px; }
.facts div { display: grid; gap: 2px; }
.facts dt { font-size: .82rem; color: var(--muted); }
.facts dd { margin: 0; color: var(--ink); font-weight: 600; }
.empty, .loading, .error-box { padding: 36px; text-align: center; color: var(--muted); background: var(--surface); border: 1px dashed var(--line); border-radius: var(--radius); }
.error-box { color: var(--danger); border-color: var(--danger-soft); }
.more { display: flex; justify-content: center; margin-top: 24px; }
.back { display: inline-flex; margin-bottom: 18px; text-decoration: none; font-weight: 600; }

/* Reading */
.article { max-width: 760px; }
.article .cover { border-radius: var(--radius); margin: 8px 0 24px; width: 100%; max-height: 460px; object-fit: cover; }
.prose { color: var(--body); font-size: 1.05rem; }
.prose p { white-space: pre-line; }
.prose mark { background: #fff2b3; padding: 0 2px; }
.prose figure { margin: 24px 0; }
.prose figcaption { color: var(--muted); font-size: .9rem; margin-top: 6px; }
.pre-line { white-space: pre-line; }
details.article-item { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px; }
details.article-item summary { cursor: pointer; font-weight: 700; color: var(--ink); }
details.article-item[open] summary { margin-bottom: 12px; }

/* Gallery */
.photos { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); }
.photos button { padding: 0; border: 0; background: var(--surface-2); border-radius: 12px; overflow: hidden; cursor: zoom-in; aspect-ratio: 1; }
.photos img { width: 100%; height: 100%; object-fit: cover; transition: transform .3s; }
.photos button:hover img { transform: scale(1.04); }
.lightbox { position: fixed; inset: 0; z-index: 80; background: rgba(15, 15, 14, .92); display: flex; align-items: center; justify-content: center; padding: 56px 16px; }
.lightbox img { max-height: 82vh; max-width: 100%; object-fit: contain; border-radius: 8px; }
.lightbox figcaption { color: #eee; text-align: center; margin-top: 10px; }
.lightbox .lb-btn { position: absolute; background: rgba(255, 255, 255, .12); color: #fff; border: 0; border-radius: 999px; width: 46px; height: 46px; font-size: 1.4rem; cursor: pointer; }
.lightbox .lb-close { top: 14px; right: 14px; }
.lightbox .lb-prev { left: 14px; top: 50%; }
.lightbox .lb-next { right: 14px; top: 50%; }

/* Forms */
.tabs { display: inline-flex; gap: 4px; background: var(--surface-2); padding: 4px; border-radius: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.tabs button { font: inherit; font-weight: 600; border: 0; background: transparent; padding: 9px 16px; border-radius: 9px; cursor: pointer; color: var(--body); }
.tabs button[aria-selected="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgba(0, 0, 0, .08); }
.tabs button[disabled] { opacity: .55; cursor: not-allowed; }
.form { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
.form .full { grid-column: 1 / -1; }
@media (max-width: 640px) { .form { grid-template-columns: minmax(0, 1fr); } }
.field { display: grid; gap: 6px; }
.field label { font-weight: 600; color: var(--ink); font-size: .92rem; }
.field label small { color: var(--muted); font-weight: 400; }
.field input, .field select, .field textarea { font: inherit; padding: 11px 13px; border-radius: 10px; border: 1px solid var(--line); background: #fff; color: var(--ink); width: 100%; }
.field input:focus, .field select:focus, .field textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
.form-error { color: var(--danger); background: var(--danger-soft); padding: 10px 14px; border-radius: 10px; }
.form-success { background: var(--accent-soft); color: var(--ink); padding: 24px; border-radius: var(--radius); text-align: center; }
.hp { position: absolute; left: -9999px; }

/* Footer */
.site-footer { margin-top: 64px; background: var(--ink); color: rgba(255, 255, 255, .78); padding: 48px 0 28px; }
.site-footer a { color: #fff; }
.site-footer .cols { display: grid; gap: 28px; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); }
@media (max-width: 760px) { .site-footer .cols { grid-template-columns: minmax(0, 1fr); } }
.site-footer h4 { color: #fff; }
.site-footer ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.site-footer .fine { border-top: 1px solid rgba(255, 255, 255, .14); margin-top: 32px; padding-top: 18px; font-size: .85rem; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
`;
