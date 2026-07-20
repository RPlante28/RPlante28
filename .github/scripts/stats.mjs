// Generates a minimal, DOS-styled (Norton Commander) SVG stats card and points
// the README at it. Runs in GitHub Actions (full API access via GH_TOKEN); no
// third-party service involved.
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
const graphql = async (query, variables) => {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`graphql -> ${r.status}`);
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
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
    return { repos: 7, weekCommits: 23, langs: [['HTML', 31], ['TypeScript', 26], ['Java', 16], ['CSS', 15], ['JavaScript', 6]] };
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

  // commits in the last 7 days (GitHub's own contribution counting)
  let weekCommits = null;
  try {
    const to = new Date();
    const from = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const data = await graphql(
      `query($l:String!,$f:DateTime!,$t:DateTime!){user(login:$l){contributionsCollection(from:$f,to:$t){totalCommitContributions}}}`,
      { l: USER, f: from.toISOString(), t: to.toISOString() }
    );
    weekCommits = data.user.contributionsCollection.totalCommitContributions;
  } catch { weekCommits = null; }

  return { repos: user.public_repos, followers: user.followers, weekCommits, langs };
}

function svg(d) {
  const W = 420, H = 112;
  const BLUE = '#0000a8', CYAN = '#54fcfc', YEL = '#fcfc54', INK = '#d4d8dc', MUT = '#9fc0f0';
  const langs = d.langs.slice(0, 5);
  const sum = langs.reduce((a, [, p]) => a + p, 0) || 1;
  const bx = 22, bw = W - 44, by = 62, bh = 12;
  let cx = bx;
  const segs = langs
    .map(([n, p]) => {
      const w = (bw * p) / sum;
      const r = `<rect x="${cx.toFixed(1)}" y="${by}" width="${(w + 0.4).toFixed(1)}" height="${bh}" fill="${colorFor(n)}"/>`;
      cx += w;
      return r;
    })
    .join('');
  let lx = bx;
  const legend = langs
    .map(([n]) => {
      const label = n.toUpperCase();
      const item = `<rect x="${lx}" y="86" width="8" height="8" fill="${colorFor(n)}"/>` +
        `<text x="${lx + 12}" y="93" fill="${MUT}" font-size="10">${esc(label)}</text>`;
      lx += 12 + label.length * 6.1 + 10;
      return item;
    })
    .join('');
  const stat2 = d.weekCommits != null ? `${d.weekCommits} COMMITS / 7D` : `${d.followers} FOLLOWERS`;
  const title = `${USER.toUpperCase()} @ GITHUB`;
  const tw = title.length * 7 + 14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${USER} GitHub stats">
  <style>text{font-family:ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace}</style>
  <rect x="6.5" y="14.5" width="${W - 13}" height="${H - 21}" fill="${BLUE}" stroke="${CYAN}"/>
  <rect x="9.5" y="17.5" width="${W - 19}" height="${H - 27}" fill="none" stroke="${CYAN}" stroke-opacity="0.35"/>
  <rect x="${(W - tw) / 2}" y="10" width="${tw}" height="10" fill="${BLUE}"/>
  <text x="${W / 2}" y="19" fill="${CYAN}" font-size="12" font-weight="700" letter-spacing="1" text-anchor="middle">${esc(title)}</text>
  <text x="22" y="42" fill="${INK}" font-size="12">${d.repos} REPOS &#160;&#160; ${stat2}</text>
  <text x="22" y="57" fill="${YEL}" font-size="10" letter-spacing="1">LANGUAGE MIX</text>
  <rect x="${bx - 1}" y="${by - 1}" width="${bw + 2}" height="${bh + 2}" fill="none" stroke="${CYAN}" stroke-opacity="0.6"/>
  <g>${segs}</g>
  ${legend}
</svg>`;
}

const d = await gather();
writeFileSync(OUT, svg(d));
const text = readFileSync(README, 'utf8');
const ref = `<!--STATS_START-->\n![${USER} GitHub stats](${OUT})\n<!--STATS_END-->`;
writeFileSync(README, text.replace(/<!--STATS_START-->[\s\S]*<!--STATS_END-->/, ref));
console.log(`[stats.mjs] wrote ${OUT} and updated ${README}`);
