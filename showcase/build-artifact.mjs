// Builds a single self-contained HTML file (dist/patient-creations.html) for hosts that only allow
// inline CSS/JS, such as claude.ai artifacts: JS is bundled and inlined, fonts and the logo become data URIs.
// Usage: npm run build:artifact
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p));
const dataUri = (p, type) => `data:${type};base64,${read(p).toString('base64')}`;

const logo = dataUri('assets/logo-mark.webp', 'image/webp');
// Card photos referenced from the HTML (assets/cards/*.webp) become data URIs too
const inlineCards = (txt) => txt.replace(/assets\/cards\/[a-z0-9-]+\.webp/g, (f) => dataUri(f, 'image/webp'));

const { outputFiles } = await build({
  entryPoints: [path.join(ROOT, 'main.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022',
  // The vendored addons import the bare specifier 'three'; point it at the same vendored copy world.js uses
  plugins: [{ name: 'three', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(ROOT, 'vendor/three.module.min.js') })); } }],
});
const js = outputFiles[0].text
  .replaceAll('assets/logo-mark.webp', logo)
  .replaceAll('</script', '<\\/script');

const css = read('styles.css').toString()
  .replace(/url\((fonts\/[^)]+\.woff2)\)/g, (_, f) => `url(${dataUri(f, 'font/woff2')})`)
  .replaceAll('assets/logo-mark.webp', logo);

const html = read('index.html').toString();
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module" src="main\.js"><\/script>/, '')
  .replaceAll('assets/logo-mark.webp', logo);
const bodyInlined = inlineCards(body);

// The host supplies the doctype, <head> and <body>; the page starts with its own title and styles.
const out = `<title>Patient Creations</title>
<meta name="description" content="Patient Creations builds cinematic AI websites, cinematic and UGC ads, Business Cards, software, and multi-agent systems." />
<style>${css}</style>
${bodyInlined.trim()}
<script type="module">${js}</script>
`;
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/patient-creations.html'), out);
console.log(`dist/patient-creations.html  ${(out.length / 1024).toFixed(0)} KB`);
