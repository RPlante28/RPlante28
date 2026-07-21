// Generates DOS-styled (Norton Commander) GitHub cards and writes them into the
// README: a stats card, a contribution calendar, and a rank/grade card. Runs in
// GitHub Actions (full API via GH_TOKEN); no third-party service involved.
import { readFileSync, writeFileSync } from 'node:fs';

const USER = process.env.GH_USER || 'RPlante28';
const TOKEN = process.env.STATS_TOKEN || process.env.GH_TOKEN || '';
const README = process.env.README || 'README.md';

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': USER };
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
const api = async (p) => {
  const r = await fetch(`https://api.github.com${p}`, { headers });
  if (!r.ok) throw new Error(`${p} -> ${r.status}`);
  return r.json();
};
const graphql = async (query, variables) => {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`graphql -> ${r.status}`);
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
};

// --- theme (ROHAN-DOS palette) ---
const BLUE = '#0000a8', CYAN = '#54fcfc', YEL = '#fcfc54', INK = '#d4d8dc', MUT = '#9fc0f0', TRACK = '#001b86';
const LC = {
  HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', JavaScript: '#f1e05a', TypeScript: '#3178c6',
  Python: '#3572A5', Java: '#b07219', C: '#555555', 'C++': '#f34b7d', PHP: '#4F5D95', Shell: '#89e051',
  Go: '#00ADD8', Ruby: '#701516', Rust: '#dea584', Vue: '#41b883', 'Jupyter Notebook': '#DA5B0B',
};
const colorFor = (n) => LC[n] || '#8b949e';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// a DOS panel with a title cut into the top border
const panel = (W, H, title, body) => {
  const tw = title.length * 7 + 14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
  <style>text{font-family:ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace}</style>
  <rect x="6.5" y="14.5" width="${W - 13}" height="${H - 21}" fill="${BLUE}" stroke="${CYAN}"/>
  <rect x="9.5" y="17.5" width="${W - 19}" height="${H - 27}" fill="none" stroke="${CYAN}" stroke-opacity="0.35"/>
  <rect x="${(W - tw) / 2}" y="10" width="${tw}" height="10" fill="${BLUE}"/>
  <text x="${W / 2}" y="19" fill="${CYAN}" font-size="12" font-weight="700" letter-spacing="1" text-anchor="middle">${esc(title)}</text>
  ${body}
</svg>`;
};

async function gather() {
  if (process.env.MOCK === '1') {
    const weeks = Array.from({ length: 53 }, () => ({
      contributionDays: Array.from({ length: 7 }, (_, wd) => ({ weekday: wd, contributionCount: Math.max(0, Math.round((Math.random() ** 2) * 10 - 2)) })),
    }));
    const d = { repos: 7, stars: 0, followers: 8, weekCommits: 11,
      langs: [['HTML', 31], ['TypeScript', 26], ['Java', 16], ['CSS', 15], ['JavaScript', 6]],
      year: { commits: 512, prs: 14, issues: 6, reviews: 3, total: 640, weeks },
      allTime: { commits: 1240, prs: 52, issues: 18, reviews: 9 } };
    d.rank = calcRank({ ...d.allTime, stars: d.stars, followers: d.followers });
    return d;
  }
  const user = await api(`/users/${USER}`);
  let repos = [], page = 1;
  for (;;) { const p = await api(`/users/${USER}/repos?per_page=100&page=${page}&type=owner`); repos = repos.concat(p); if (p.length < 100) break; page++; }
  const sources = repos.filter((r) => !r.private && !r.fork);
  const stars = sources.reduce((a, r) => a + (r.stargazers_count || 0), 0);
  const bytes = {};
  for (const r of sources) { try { const l = await api(`/repos/${r.full_name}/languages`); for (const [k, v] of Object.entries(l)) bytes[k] = (bytes[k] || 0) + v; } catch { /* skip */ } }
  const totalB = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
  const langs = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, Math.round((v / totalB) * 100)]);

  let weekCommits = null;
  try {
    const to = new Date(), from = new Date(Date.now() - 7 * 864e5);
    const w = await graphql(`query($l:String!,$f:DateTime!,$t:DateTime!){user(login:$l){contributionsCollection(from:$f,to:$t){totalCommitContributions restrictedContributionsCount}}}`, { l: USER, f: from.toISOString(), t: to.toISOString() });
    const wc = w.user.contributionsCollection;
    weekCommits = wc.totalCommitContributions + wc.restrictedContributionsCount;
  } catch { weekCommits = null; }

  let year = { commits: 0, prs: 0, issues: 0, reviews: 0, total: 0, weeks: [] };
  try {
    const y = await graphql(`query($l:String!){user(login:$l){contributionsCollection{totalCommitContributions restrictedContributionsCount totalPullRequestContributions totalIssueContributions totalPullRequestReviewContributions contributionCalendar{totalContributions weeks{contributionDays{contributionCount weekday}}}}}}`, { l: USER });
    const c = y.user.contributionsCollection;
    year = { commits: c.totalCommitContributions + c.restrictedContributionsCount, prs: c.totalPullRequestContributions, issues: c.totalIssueContributions, reviews: c.totalPullRequestReviewContributions, total: c.contributionCalendar.totalContributions, weeks: c.contributionCalendar.weeks };
  } catch { /* leave empty */ }

  // all-time totals: PRs/issues via GraphQL totalCount, commits summed per year
  // (includes private contributions when a STATS_TOKEN with access is set).
  const allTime = { commits: year.commits, prs: 0, issues: 0, reviews: year.reviews };
  try {
    const t = await graphql(`query($l:String!){user(login:$l){createdAt pullRequests{totalCount} issues{totalCount}}}`, { l: USER });
    allTime.prs = t.user.pullRequests.totalCount;
    allTime.issues = t.user.issues.totalCount;
    const startY = new Date(t.user.createdAt).getUTCFullYear();
    const nowY = new Date().getUTCFullYear();
    let sum = 0, ok = false;
    for (let yr = startY; yr <= nowY; yr++) {
      const f = `${yr}-01-01T00:00:00Z`;
      const to = yr === nowY ? new Date().toISOString() : `${yr}-12-31T23:59:59Z`;
      const r = await graphql(`query($l:String!,$f:DateTime!,$t:DateTime!){user(login:$l){contributionsCollection(from:$f,to:$t){totalCommitContributions restrictedContributionsCount}}}`, { l: USER, f, t: to });
      const cc = r.user.contributionsCollection;
      sum += cc.totalCommitContributions + cc.restrictedContributionsCount; ok = true;
    }
    if (ok) allTime.commits = sum;
  } catch { /* keep year commits */ }

  const d = { repos: user.public_repos, stars, followers: user.followers, weekCommits, langs, year, allTime };
  d.rank = calcRank({ ...allTime, stars: d.stars, followers: d.followers });
  return d;
}

// github-readme-stats rank algorithm (percentile -> letter)
function calcRank(x) {
  const expcdf = (v) => 1 - Math.pow(2, -v);
  const lncdf = (v) => v / (1 + v);
  const W = { commits: 2, prs: 3, issues: 1, reviews: 1, stars: 4, followers: 1 };
  const M = { commits: 1000, prs: 50, issues: 25, reviews: 2, stars: 50, followers: 10 };
  const total = Object.values(W).reduce((a, b) => a + b, 0);
  const rank = 1 - (
    W.commits * expcdf((x.commits || 0) / M.commits) +
    W.prs * expcdf((x.prs || 0) / M.prs) +
    W.issues * expcdf((x.issues || 0) / M.issues) +
    W.reviews * expcdf((x.reviews || 0) / M.reviews) +
    W.stars * lncdf((x.stars || 0) / M.stars) +
    W.followers * lncdf((x.followers || 0) / M.followers)
  ) / total;
  const pct = rank * 100;
  const TH = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
  const LV = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];
  return { level: LV[TH.findIndex((t) => pct <= t)] || 'C', percentile: pct };
}

function svgStats(d) {
  const W = 420, H = 112, bx = 22, bw = W - 44, by = 62, bh = 12;
  const langs = d.langs.slice(0, 5), sum = langs.reduce((a, [, p]) => a + p, 0) || 1;
  let cx = bx;
  const segs = langs.map(([n, p]) => { const w = (bw * p) / sum; const r = `<rect x="${cx.toFixed(1)}" y="${by}" width="${(w + 0.4).toFixed(1)}" height="${bh}" fill="${colorFor(n)}"/>`; cx += w; return r; }).join('');
  let lx = bx;
  const legend = langs.map(([n]) => { const l = n.toUpperCase(); const s = `<rect x="${lx}" y="86" width="8" height="8" fill="${colorFor(n)}"/><text x="${lx + 12}" y="93" fill="${MUT}" font-size="10">${esc(l)}</text>`; lx += 12 + l.length * 6.1 + 10; return s; }).join('');
  const stat2 = d.weekCommits != null ? `${d.weekCommits} COMMITS / 7D` : `${d.followers} FOLLOWERS`;
  const body = `<text x="22" y="42" fill="${INK}" font-size="12">${d.repos} REPOS &#160;&#160; ${stat2}</text>
  <text x="22" y="57" fill="${YEL}" font-size="10" letter-spacing="1">LANGUAGE MIX</text>
  <rect x="${bx - 1}" y="${by - 1}" width="${bw + 2}" height="${bh + 2}" fill="none" stroke="${CYAN}" stroke-opacity="0.6"/>
  <g>${segs}</g>${legend}`;
  return panel(W, H, `${USER.toUpperCase()} @ GITHUB`, body);
}

function svgCalendar(d) {
  const cell = 6, gap = 1, pitch = cell + gap, x0 = 24, y0 = 30;
  const weeks = d.year.weeks || [];
  const cols = weeks.length || 53;
  const W = x0 * 2 + cols * pitch - gap, H = y0 + 7 * pitch + 26;
  const lvl = (c) => (c <= 0 ? TRACK : c < 3 ? '#14622f' : c < 6 ? '#1f8a42' : c < 9 ? '#2fb257' : '#3cf06a');
  let cells = '';
  weeks.forEach((w, wi) => (w.contributionDays || []).forEach((day) => {
    const wd = day.weekday ?? 0, x = x0 + wi * pitch, y = y0 + wd * pitch;
    cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="1" fill="${lvl(day.contributionCount)}"/>`;
  }));
  const body = `<text x="24" y="${H - 13}" fill="${MUT}" font-size="10">${d.year.total || 0} CONTRIBUTIONS IN THE LAST YEAR</text>${cells}`;
  return panel(W, H, 'CONTRIBUTIONS · 1Y', body);
}

function svgRank(d) {
  const W = 420, H = 126;
  const { level, percentile } = d.rank;
  const cx = 66, cy = 60, r = 30, C = 2 * Math.PI * r;
  const frac = Math.max(0.03, Math.min(1, (100 - percentile) / 100));
  const dash = `${(C * frac).toFixed(1)} ${(C * (1 - frac)).toFixed(1)}`;
  const rows = [
    ['COMMITS', d.allTime.commits || 0],
    ['PULL REQUESTS', d.allTime.prs || 0],
    ['ISSUES', d.allTime.issues || 0],
    ['STARS', d.stars || 0],
  ];
  const stats = rows.map((row, i) => {
    const y = 46 + i * 17;
    return `<text x="140" y="${y}" fill="${MUT}" font-size="11">${esc(row[0])}</text><text x="392" y="${y}" fill="${INK}" font-size="11" text-anchor="end">${row[1]}</text>`;
  }).join('');
  const body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${TRACK}" stroke-width="7"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CYAN}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${dash}" transform="rotate(-90 ${cx} ${cy})"/>
  <text x="${cx}" y="${cy + 9}" fill="${YEL}" font-size="26" font-weight="700" text-anchor="middle">${esc(level)}</text>
  <text x="${cx}" y="${cy + r + 16}" fill="${MUT}" font-size="10" text-anchor="middle">TOP ${percentile < 10 ? percentile.toFixed(1) : Math.round(percentile)}%</text>
  ${stats}`;
  return panel(W, H, 'RANK', body);
}

const d = await gather();
writeFileSync('stats.svg', svgStats(d));
writeFileSync('calendar.svg', svgCalendar(d));
writeFileSync('rank.svg', svgRank(d));
const text = readFileSync(README, 'utf8');
writeFileSync(README, text.replace(/<!--STATS_START-->[\s\S]*<!--STATS_END-->/, `<!--STATS_START-->\n![${USER} GitHub stats](stats.svg)\n<!--STATS_END-->`));
console.log('[stats.mjs] wrote stats.svg, calendar.svg, rank.svg');
