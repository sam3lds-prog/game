// Bundles dist/ into one self-contained HTML fragment for publishing as a Claude artifact.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const assets = readdirSync('dist/assets');
const css = readFileSync('dist/assets/' + assets.find((f) => f.endsWith('.css')), 'utf8');
const js = readFileSync('dist/assets/' + assets.find((f) => f.endsWith('.js')), 'utf8');
const favicon = readFileSync('public/favicon.svg', 'utf8');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[^>]*><\/script>/g, '').trim();
const out = `<title>Cats vs Dogs</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}">
<style>${css}</style>
${body}
<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/cats-vs-dogs.html', out);
console.log('artifact/cats-vs-dogs.html', out.length, 'bytes');
