// Builds the showcase for the patientcreations.com Next.js app, where it is the homepage.
// Unlike build-artifact.mjs (one self-contained file), this writes cacheable, content-hashed files:
//   <site>/public/assets/experience/*   the script, stylesheet, fonts, logo and card photos
//   <site>/lib/site/home/home.html      the page itself, served at "/" by app/route.ts
// Usage: node build-site.mjs ../../patient-creations
import { build } from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(process.argv[2] ?? '../../patient-creations');
if (!fs.existsSync(path.join(SITE, 'next.config.mjs'))) throw new Error(`not the site repo: ${SITE}`);

const PUB = '/assets/experience';
const OUT = path.join(SITE, 'public/assets/experience');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Writes a file under a name carrying its content hash, so it can be cached forever, and returns its public path.
const emit = (name, data) => {
  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 10);
  const ext = path.extname(name);
  const file = `${path.basename(name, ext)}.${hash}${ext}`;
  fs.writeFileSync(path.join(OUT, file), data);
  return `${PUB}/${file}`;
};
const read = (p) => fs.readFileSync(path.join(ROOT, p));

const logo = emit('logo-mark.webp', read('assets/logo-mark.webp'));
const fonts = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'fonts')).map((f) => [`fonts/${f}`, emit(f, read(`fonts/${f}`))]));
const cards = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'assets/cards')).map((f) => [`assets/cards/${f}`, emit(f, read(`assets/cards/${f}`))]));

const css = emit('styles.css', read('styles.css').toString()
  .replace(/url\((fonts\/[^)]+\.woff2)\)/g, (_, f) => `url(${fonts[f]})`)
  .replaceAll('assets/logo-mark.webp', logo));

const { outputFiles } = await build({
  entryPoints: [path.join(ROOT, 'main.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022',
  plugins: [{ name: 'three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(ROOT, 'vendor/three.module.min.js') })); } }],
});
const js = emit('app.js', outputFiles[0].text.replaceAll('assets/logo-mark.webp', logo));

const SITE_URL = 'https://patientcreations.com';
const TITLE = 'Patient Creations | Cinematic AI Websites, UGC Ads & Business Cards';
const DESC = 'Patient Creations builds cinematic AI websites, cinematic and UGC ads, Business Cards, software, and multi-agent systems. Agency quality at freelancer-floor pricing, starting with a flat-price one-page business website.';
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'Patient Creations', alternateName: ['Patient Profits', 'The Digital Master'], url: SITE_URL, logo: `${SITE_URL}/assets/brand/patient-creations-logo.png`, description: DESC },
    { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: SITE_URL, name: 'Patient Creations', publisher: { '@id': `${SITE_URL}/#organization` } },
  ],
};

const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(TITLE)}</title>
<meta name="description" content="${esc(DESC)}" />
<link rel="canonical" href="${SITE_URL}/" />
<meta name="theme-color" content="#141412" />
<meta name="robots" content="index, follow" />
<meta name="copyright" content="© 2026 Patient Profits LLC. All rights reserved." />
<meta name="tdm-reservation" content="1" />
<meta name="tdm-policy" content="${SITE_URL}/copyright" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Patient Creations" />
<meta property="og:url" content="${SITE_URL}/" />
<meta property="og:title" content="${esc(TITLE)}" />
<meta property="og:description" content="${esc(DESC)}" />
<meta property="og:image" content="${SITE_URL}/assets/brand/patient-creations-share.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(TITLE)}" />
<meta name="twitter:description" content="${esc(DESC)}" />
<meta name="twitter:image" content="${SITE_URL}/assets/brand/patient-creations-share.jpg" />
<link rel="icon" href="/icon.png" type="image/png" />
<link rel="apple-touch-icon" href="/apple-icon.png" />
<link rel="preload" href="${fonts['fonts/inter-latin-400-normal.woff2']}" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="${fonts['fonts/instrument-serif-latin-400-italic.woff2']}" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="${css}" />
<link rel="modulepreload" href="${js}" />
<script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll('<', '\\u003c')}</script>
</head>
`;

const html = read('index.html').toString();
const body = html.slice(html.indexOf('<body>'), html.indexOf('</body>'))
  .replace(/<script type="module" src="main\.js"><\/script>/, `<script type="module" src="${js}"></script>`)
  .replaceAll('assets/logo-mark.webp', logo)
  .replace(/assets\/cards\/[a-z0-9-]+\.webp/g, (f) => cards[f.replace(/^.*?assets/, 'assets')])
  // Links to the rest of the site stay on whichever host is serving it (previews included).
  .replaceAll(`href="${SITE_URL}/`, 'href="/')
  // Prices are filled in by the site from its live price list (app/route.ts), so none is typed into the page.
  .replace(/<span data-live="([a-z-]+)">[^<]*<\/span>/g, '<span data-live="$1">{{$1}}</span>');
if (!body.includes(js)) throw new Error('main.js script tag not found in index.html');
const typed = body.match(/\$\s?\d[\d,]*/);
if (typed) throw new Error(`a price is typed into index.html (${typed[0]}); wrap it in <span data-live="slug">`);

const outHtml = path.join(SITE, 'lib/site/home/home.html');
fs.mkdirSync(path.dirname(outHtml), { recursive: true });
fs.writeFileSync(outHtml, `${head}${body}</body>\n</html>\n`);
console.log(`home.html ${(fs.statSync(outHtml).size / 1024).toFixed(0)} KB; assets: ${fs.readdirSync(OUT).length} files`);
