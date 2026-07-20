// Generates a minimal, colored, terminal-style GitHub stats card as an SVG
// (stats.svg) and points the README at it. Runs in GitHub Actions (full API
// access via GH_TOKEN); no third-party service involved.
import { readFileSync, writeFileSync } from 'node:fs';

const USER = process.env.GH_USER || 'RPlante28';
const TOKEN = process.env.GH_TOKEN || '';
const README = process.env.README || 'README.md';
const OUT = process.env.OUT || 'stats.svg';

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': USER };
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
const api = async (p) => {
  const r = await fetch(`https://api.github.com${p}`, { headers });
  if (!r.ok) throw new Error(`${p} -> ${r.status}`);
  return r.json();
};

// GitHub linguist colors (fallback slate).
const LC = {
  HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', JavaScript: '#f1e05a',
  TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219', C: '#555555',
  'C++': '#f34b7d', PHP: '#4F5D95', Shell: '#89e051', Go: '#00ADD8',
  Ruby: '#701516', Rust: '#dea584', Vue: '#41b883', 'Jupyter Notebook': '#DA5B0B',
  Dockerfile: '#384d54', Makefile: '#427819', Lua: '#000080',
};
const colorFor = (n) => LC[n] || '#8b949e';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function gather() {
  if (process.env.MOCK === '1') {
    return { repos: 7, followers: 8, langs: [['HTML', 31], ['TypeScript', 26], ['Java', 16], ['CSS', 15], ['JavaScript', 6], ['Python', 6]] };
  }
  const user = await api(`/users/${USER}`);
  let repos = [], page = 1;
  for (;;) {
    const p = await api(`/users/${USER}/repos?per_page=100&page=${page}&type=owner`);
    repos = repos.concat(p);
    if (p.length < 100) break;
    page++;
  }
  const sources = repos.filter((r) => !r.private && !r.fork);
  const bytes = {};
  for (const r of sources) {
    try {
      const l = await api(`/repos/${r.full_name}/languages`);
      for (const [k, v] of Object.entries(l)) bytes[k] = (bytes[k] || 0) + v;
    } catch { /* skip one repo */ }
  }
  const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
  const langs = Object.entries(bytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => [k, Math.round((v / total) * 100)]);
  return { repos: user.public_repos, followers: user.followers, langs };
}

function svg(d) {
  const W = 460, H = 150, x0 = 24, barW = W - x0 * 2, barY = 84, barH = 12;
  const langs = d.langs.slice(0, 6);
  const sum = langs.reduce((a, [, p]) => a + p, 0) || 1;
  let cx = x0;
  const segs = langs
    .map(([n, p]) => {
      const w = (barW * p) / sum;
      const rect = `<rect x="${cx.toFixed(1)}" y="${barY}" width="${(w + 0.4).toFixed(1)}" height="${barH}" fill="${colorFor(n)}"/>`;
      cx += w;
      return rect;
    })
    .join('');
  const legend = langs
    .map(([n, p], i) => {
      const lx = x0 + (i % 3) * 138;
      const ly = 118 + Math.floor(i / 3) * 20;
      return `<circle cx="${lx + 4}" cy="${ly - 4}" r="4" fill="${colorFor(n)}"/>` +
        `<text x="${lx + 14}" y="${ly}" fill="#9fb3d1" font-size="12">${esc(n)} ${p}%</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${USER} GitHub stats">
  <style>text{font-family:ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace}</style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="#0d1b2a" stroke="#22304a"/>
  <text x="${x0}" y="34" fill="#5aa0ff" font-size="15" font-weight="700">${USER.toLowerCase()} @ github</text>
  <text x="${x0}" y="58" fill="#c9d6e6" font-size="13">${d.repos} repositories &#183; ${d.followers} followers</text>
  <text x="${x0}" y="${barY - 8}" fill="#6f8bb0" font-size="11" letter-spacing="0.06em">LANGUAGE MIX</text>
  <clipPath id="r"><rect x="${x0}" y="${barY}" width="${barW}" height="${barH}" rx="6"/></clipPath>
  <g clip-path="url(#r)">${segs}</g>
  ${legend}
</svg>`;
}

const d = await gather();
writeFileSync(OUT, svg(d));
const text = readFileSync(README, 'utf8');
const ref = `<!--STATS_START-->\n![${USER} GitHub stats](${OUT})\n<!--STATS_END-->`;
writeFileSync(README, text.replace(/<!--STATS_START-->[\s\S]*<!--STATS_END-->/, ref));
console.log(`[stats.mjs] wrote ${OUT} and updated ${README}`);
