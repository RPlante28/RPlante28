// Generates a neofetch-style GitHub stats card and writes it into README.md
// between the STATS markers. Runs in GitHub Actions (full API access via
// GH_TOKEN); no third-party service involved.
import { readFileSync, writeFileSync } from 'node:fs';

const USER = process.env.GH_USER || 'RPlante28';
const TOKEN = process.env.GH_TOKEN || '';
const README = process.env.README || 'README.md';

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': USER };
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

const api = async (path) => {
  const r = await fetch(`https://api.github.com${path}`, { headers });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
};

// ---- gather (real data in CI; MOCK=1 uses sample data for local testing) ----
async function gather() {
  if (process.env.MOCK === '1') {
    return {
      repos: 8, stars: 14, followers: 6,
      langs: [['TypeScript', 52], ['Python', 26], ['Java', 12], ['C', 6], ['PHP', 4]],
      flagship: '6502-emulator',
    };
  }
  const user = await api(`/users/${USER}`);
  let repos = [], page = 1;
  for (;;) {
    const p = await api(`/users/${USER}/repos?per_page=100&page=${page}&type=owner`);
    repos = repos.concat(p);
    if (p.length < 100) break;
    page++;
  }
  const pub = repos.filter((r) => !r.private);
  const sources = pub.filter((r) => !r.fork);
  const stars = sources.reduce((a, r) => a + (r.stargazers_count || 0), 0);
  const bytes = {};
  for (const r of sources) {
    try {
      const l = await api(`/repos/${r.full_name}/languages`);
      for (const [k, v] of Object.entries(l)) bytes[k] = (bytes[k] || 0) + v;
    } catch { /* ignore a single repo failure */ }
  }
  const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
  const langs = Object.entries(bytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => [k, Math.round((v / total) * 100)]);
  const flagship = [...sources].sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))[0];
  return {
    repos: user.public_repos,
    stars,
    followers: user.followers,
    langs,
    flagship: flagship ? flagship.name : '',
  };
}

// ---- render a neofetch-style card ----
function render(d) {
  const logo = [
    '   .------------------.',
    '   |  ROHAN-DOS  5.51 |',
    '   |  ::::::::::::::   |',
    "   '------------------'",
    '   [::::::::::::::::::]',
    '',
    '   Rohan Plante',
    '   CS @ Marist University',
  ];
  const langLine = d.langs.map(([k]) => k).join(' · ');
  const bar = d.langs
    .map(([, p]) => p)
    .map((p) => Math.max(1, Math.round(p / 5)))
    .map((n) => '█'.repeat(n))
    .join(' ');
  const info = [
    `${USER.toLowerCase()}@github`,
    '------------------------------',
    `Public repos . ${d.repos}`,
    `Total stars .. ${d.stars}`,
    `Followers .... ${d.followers}`,
    `Flagship ..... ${d.flagship}`,
    `Top language . ${d.langs[0] ? d.langs[0][0] : '-'}`,
    `Languages .... ${langLine}`,
    `Mix .......... ${bar}`,
    `Updated ...... ${new Date().toISOString().slice(0, 10)}`,
  ];
  const rows = Math.max(logo.length, info.length);
  const lines = [];
  for (let i = 0; i < rows; i++) {
    const l = (logo[i] || '').padEnd(30);
    const r = info[i] || '';
    lines.push((l + r).replace(/\s+$/, ''));
  }
  return '```text\n' + lines.join('\n') + '\n```';
}

const d = await gather();
const card = render(d);
const text = readFileSync(README, 'utf8');
const out = text.replace(
  /<!--STATS_START-->[\s\S]*<!--STATS_END-->/,
  `<!--STATS_START-->\n${card}\n<!--STATS_END-->`
);
writeFileSync(README, out);
console.log(card);
console.log('\n[stats.mjs] README updated.');
