import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.env.PRAVYO_SOURCE || '../schoolproject');
if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'pravyo') throw new Error('Expected the existing Pravyo repository');
function write(relative, content) { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
for (const relative of ['lib/casPublished.js', 'components/cas/PublishedResults.js', 'components/cas/PublishedResults.module.css']) write(relative, fs.readFileSync(`integration/dashboard/${relative}`, 'utf8'));
// Share the same report rendering and date/calculation logic. CSS is locally scoped.
let report = fs.readFileSync('components/Report.js', 'utf8').replace("'@pravyo/lib/nepaliDate'", "'@/lib/nepaliDate'").replace("'@/lib/results'", "'@/lib/casResults'");
report = report.replace("import { useState }", "import styles from './Report.module.css';\nimport { useState }");
report = report.replace(/className="([^"]+)"/g, (_, classes) => `className={[${classes.split(' ').map(c => `styles['${c}']`).join(',')}].join(' ')}`);
report = report.replace('<a href="/">← Results</a>', '<a href="../">← Learning reports</a>');
write('components/cas/Report.js', report);
write('lib/casResults.js', fs.readFileSync('lib/results.js', 'utf8'));
// Scope all element selectors under the component root for the existing dashboard.
const css = fs.readFileSync('app/globals.css', 'utf8');
const start = css.indexOf('.report-shell{');
let reportCss = css.slice(start, css.indexOf('@media(max-width'));
reportCss += `\n.mark{display:grid;place-items:center;width:34px;height:36px;border-radius:9px;background:#126b53;color:white;font-size:22px;font-weight:700}.pill{font-size:11px;padding:5px 10px;border:1px solid #dfe7e2;border-radius:20px}.check{display:flex;align-items:center;gap:8px}.eyebrow{font-size:10px;letter-spacing:2px;color:#126b53}.report-shell{--line:#dfe7e2;--muted:#647570;--green:#126b53;--bg:#f6f8f5}.report-shell table{width:100%;border-collapse:collapse;text-align:left}.report-shell td,.report-shell th{padding:12px;border-bottom:1px solid #dfe7e2}.report-shell button{padding:10px 16px;background:#126b53;color:white;border-radius:6px}.report-shell dd{margin:0}.report-shell dt{font-size:12px;color:#647570}.report-shell h3{font-weight:600}.report-shell h2{font-weight:700}.report-shell p{margin:8px 0}.report-shell input{accent-color:#126b53}.report-shell a{color:#126b53}\n@media(max-width:700px){.report{padding:16px}.report-top{flex-wrap:wrap}.student-info{grid-template-columns:1fr 1fr}.print-toolbar{flex-wrap:wrap}.signatures div{min-width:100px}.report-shell td,.report-shell th{padding:6px;font-size:11px}}\n@media print{.print-toolbar{display:none}.report-shell{position:absolute;left:0;top:0;width:100%;background:white;z-index:99999;max-width:none}.report{border:0;min-height:265mm;break-after:page;margin:0;padding:14mm}.report-details{break-before:page}.report-shell tr{break-inside:avoid}}`;
write('components/cas/Report.module.css', reportCss);
write('app/api/cas-published/route.js', `import { publishedCas } from '@/lib/casPublished';\nexport const dynamic = 'force-dynamic';\nexport async function GET(request) { try { return await publishedCas(request); } catch { return Response.json({ error: 'Unable to load results' }, { status: 500 }); } }\n`);
for (const role of ['parent', 'student']) {
  const component = role === 'parent' ? 'ParentResults' : 'StudentResults';
  write(`app/${role}/learning/cas/page.js`, `import { ${component} } from '@/components/cas/PublishedResults';\nexport default function Page() { return <${component} />; }\n`);
  write(`app/${role}/learning/cas/[id]/page.js`, `import { ${component} } from '@/components/cas/PublishedResults';\nexport default async function Page({ params }) { return <${component} reportId={(await params).id} />; }\n`);
}
const navFile = path.join(root, 'components/navigation/appNavigation.js');
let nav = fs.readFileSync(navFile, 'utf8');
if (!nav.includes('/student/learning/cas')) nav = nav.replace('export const STUDENT_NAV_LINKS = [', 'export const STUDENT_NAV_LINKS = [\n  { name: "My Learning", href: "/student/learning/cas", icon: FaGraduationCap },');
fs.writeFileSync(navFile, nav);
const parentFile = path.join(root, 'app/parent/page.js');
let parent = fs.readFileSync(parentFile, 'utf8');
if (!parent.includes('/parent/learning/cas')) parent = parent.replace('<JourneyPreview childName={child.name} />', '<Link href="/parent/learning/cas" className={styles.journeyLink}>Learning · Continuous Assessment / निरन्तर मूल्याङ्कन</Link>\n    <JourneyPreview childName={child.name} />');
fs.writeFileSync(parentFile, parent);
console.log('Installed published-result readers and two navigation links in the existing Pravyo application. No database writes.');
