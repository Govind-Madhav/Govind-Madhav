const fs = require("fs");
const path = require("path");

async function generateStats() {
  const token = process.env.GITHUB_TOKEN;
  const username = process.env.GITHUB_REPOSITORY_OWNER || "Govind-Madhav";

  let totalContributions = 415;
  let totalStars = 1;
  let totalForks = 6;
  let totalRepos = 18;
  let currentStreak = 1;
  let longestStreak = 5;
  let topLanguages = [
    { name: "JavaScript", percent: 50, color: "#10B981" },
    { name: "TypeScript", percent: 13, color: "#F59E0B" },
    { name: "Python", percent: 13, color: "#8B5CF6" },
    { name: "Java", percent: 13, color: "#3B82F6" },
  ];

  if (token) {
    try {
      const query = `{
        user(login: "${username}") {
          createdAt
          contributionsCollection {
            totalCommitContributions
            restrictedContributionsCount
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  date
                  contributionCount
                  color
                  weekday
                }
              }
            }
          }
          repositories(first: 100, ownerAffiliations: OWNER) {
            totalCount
            nodes {
              name
              isPrivate
              stargazerCount
              forkCount
              primaryLanguage {
                name
              }
            }
          }
        }
      }`;

      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "GitHub-Profile-Stats-Generator",
        },
        body: JSON.stringify({ query }),
      });

      const json = await res.json();
      const user = json.data?.user;

      if (user) {
        const calendar = user.contributionsCollection?.contributionCalendar;
        const fetchedContribs = calendar?.totalContributions || 0;
        if (fetchedContribs > 0) totalContributions = Math.max(fetchedContribs, 415);

        const repos = user.repositories?.nodes || [];
        let fetchedStars = 0;
        let fetchedForks = 0;
        const langCount = {};

        repos.forEach((r) => {
          fetchedStars += r.stargazerCount || 0;
          fetchedForks += r.forkCount || 0;
          if (r.primaryLanguage?.name) {
            langCount[r.primaryLanguage.name] = (langCount[r.primaryLanguage.name] || 0) + 1;
          }
        });

        totalStars = Math.max(fetchedStars, 1);
        totalForks = Math.max(fetchedForks, 6);
        totalRepos = Math.max(user.repositories?.totalCount || 0, 18);

        const allDays = [];
        (calendar?.weeks || []).forEach((w) => {
          (w.contributionDays || []).forEach((d) => {
            allDays.push(d);
          });
        });

        let tempStreak = 0;
        for (let i = 0; i < allDays.length; i++) {
          if (allDays[i].contributionCount > 0) {
            tempStreak++;
            if (tempStreak > longestStreak) longestStreak = tempStreak;
          } else {
            tempStreak = 0;
          }
        }

        const totalLangRepos = Object.values(langCount).reduce((a, b) => a + b, 0) || 1;
        const langColors = {
          TypeScript: "#F59E0B",
          JavaScript: "#10B981",
          Java: "#3B82F6",
          Python: "#8B5CF6",
          HTML: "#EC4899",
          CSS: "#06B6D4",
          "Jupyter Notebook": "#F97316",
          Shell: "#64748B",
        };

        const parsedLangs = Object.entries(langCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name, count]) => ({
            name,
            percent: Math.round((count / totalLangRepos) * 100),
            color: langColors[name] || "#F59E0B",
          }));

        if (parsedLangs.length > 0) topLanguages = parsedLangs;
      }
    } catch (err) {
      console.warn("Error querying GraphQL, using defaults:", err);
    }
  }

  const outDir = path.join(__dirname, "../../dist");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Generate github-overview.svg
  const overviewSvg = `<svg width="495" height="195" viewBox="0 0 495 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .header { font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif; fill: #F59E0B; }
    .stat-label { font: 600 10px 'Segoe UI', Ubuntu, Sans-Serif; fill: #71717A; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-val { font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif; fill: #FFFFFF; }
    .stat-val-green { font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif; fill: #10B981; }
    .stat-val-amber { font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif; fill: #F59E0B; }
    .card-bg { fill: #0A0A0A; stroke: #262626; stroke-width: 1px; rx: 12px; }
    .box-bg { fill: #121212; stroke: #1F1F1F; stroke-width: 1px; rx: 8px; }
  </style>
  <rect class="card-bg" x="1" y="1" width="493" height="193" />
  
  <text x="24" y="32" class="header">${username.toUpperCase()}'S GITHUB OVERVIEW</text>
  <circle cx="465" cy="28" r="4" fill="#10B981" />

  <g transform="translate(24, 48)">
    <!-- Box 1: Total Stars -->
    <rect class="box-bg" x="0" y="0" width="215" height="58" />
    <text x="16" y="24" class="stat-label">TOTAL STARS</text>
    <text x="16" y="44" class="stat-val">${totalStars}</text>

    <!-- Box 2: Total Commits -->
    <rect class="box-bg" x="231" y="0" width="215" height="58" />
    <text x="16" y="24" class="stat-label">TOTAL COMMITS</text>
    <text x="16" y="44" class="stat-val-green">${totalContributions}+</text>

    <!-- Box 3: Total PRs -->
    <rect class="box-bg" x="0" y="70" width="215" height="58" />
    <text x="16" y="24" class="stat-label">TOTAL PRS & FORKS</text>
    <text x="16" y="44" class="stat-val">${totalForks}</text>

    <!-- Box 4: Contributed to -->
    <rect class="box-bg" x="231" y="70" width="215" height="58" />
    <text x="16" y="24" class="stat-label">CONTRIBUTED TO</text>
    <text x="16" y="44" class="stat-val-amber">${totalRepos} repos</text>
  </g>
</svg>`;

  // 2. Generate github-languages.svg
  let langBars = "";
  let currentX = 0;
  topLanguages.forEach((l) => {
    const w = (l.percent / 100) * 446;
    langBars += `<rect x="${currentX}" y="0" width="${w}" height="10" fill="${l.color}" rx="2" />`;
    currentX += w;
  });

  let langGrid = "";
  topLanguages.forEach((l, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col * 231;
    const y = row * 40;
    langGrid += `
      <g transform="translate(${x}, ${y})">
        <rect class="box-bg" x="0" y="0" width="215" height="34" />
        <circle cx="16" cy="17" r="4" fill="${l.color}" />
        <text x="28" y="21" class="lang-name">${l.name}</text>
        <text x="198" y="21" class="lang-pct" fill="${l.color}" text-anchor="end">${l.percent}%</text>
      </g>
    `;
  });

  const languagesSvg = `<svg width="495" height="195" viewBox="0 0 495 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .header { font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif; fill: #F59E0B; }
    .subtitle { font: 600 10px 'Segoe UI', Ubuntu, Sans-Serif; fill: #71717A; }
    .lang-name { font: 600 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: #E4E4E7; }
    .lang-pct { font: 700 12px 'Segoe UI', Ubuntu, Sans-Serif; }
    .card-bg { fill: #0A0A0A; stroke: #262626; stroke-width: 1px; rx: 12px; }
    .box-bg { fill: #121212; stroke: #1F1F1F; stroke-width: 1px; rx: 8px; }
  </style>
  <rect class="card-bg" x="1" y="1" width="493" height="193" />
  
  <text x="24" y="32" class="header">MOST USED LANGUAGES</text>
  <text x="471" y="32" class="subtitle" text-anchor="end">LIVE STACK</text>

  <g transform="translate(24, 48)">
    <rect x="0" y="0" width="446" height="10" fill="#171717" rx="5" />
    <g clip-path="url(#bar-clip)">
      ${langBars}
    </g>
    <g transform="translate(0, 24)">
      ${langGrid}
    </g>
  </g>
</svg>`;

  // 3. Generate github-streak.svg
  const streakSvg = `<svg width="990" height="195" viewBox="0 0 990 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .header { font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif; fill: #F59E0B; }
    .badge { font: 700 11px 'Segoe UI', Ubuntu, Sans-Serif; fill: #10B981; }
    .stat-label { font: 600 10px 'Segoe UI', Ubuntu, Sans-Serif; fill: #71717A; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-val { font: 700 24px 'Segoe UI', Ubuntu, Sans-Serif; fill: #F59E0B; }
    .stat-val-green { font: 700 24px 'Segoe UI', Ubuntu, Sans-Serif; fill: #10B981; }
    .card-bg { fill: #0A0A0A; stroke: #262626; stroke-width: 1px; rx: 12px; }
    .box-bg { fill: #121212; stroke: #1F1F1F; stroke-width: 1px; rx: 8px; }
  </style>
  <rect class="card-bg" x="1" y="1" width="988" height="193" />
  
  <text x="24" y="32" class="header">🔥 GITHUB CONTRIBUTION STREAK</text>
  <rect x="870" y="16" width="96" height="24" fill="#064E3B" rx="12" stroke="#059669" stroke-width="1" />
  <text x="918" y="32" class="badge" text-anchor="middle">ACTIVE STREAK</text>

  <g transform="translate(24, 52)">
    <!-- Box 1: Total Commits -->
    <rect class="box-bg" x="0" y="0" width="300" height="110" />
    <text x="150" y="40" class="stat-label" text-anchor="middle">TOTAL COMMITS</text>
    <text x="150" y="75" class="stat-val" text-anchor="middle">${totalContributions}+</text>

    <!-- Box 2: Current Streak -->
    <rect class="box-bg" x="321" y="0" width="300" height="110" />
    <text x="471" y="40" class="stat-label" text-anchor="middle">CURRENT STREAK</text>
    <text x="471" y="75" class="stat-val-green" text-anchor="middle">${currentStreak} Days</text>

    <!-- Box 3: Longest Streak -->
    <rect class="box-bg" x="642" y="0" width="300" height="110" />
    <text x="792" y="40" class="stat-label" text-anchor="middle">LONGEST STREAK</text>
    <text x="792" y="75" class="stat-val" text-anchor="middle">${longestStreak} Days</text>
  </g>
</svg>`;

  fs.writeFileSync(path.join(outDir, "github-overview.svg"), overviewSvg);
  fs.writeFileSync(path.join(outDir, "github-languages.svg"), languagesSvg);
  fs.writeFileSync(path.join(outDir, "github-streak.svg"), streakSvg);

  console.log("Successfully generated SVG cards in dist/ directory!");
}

generateStats();
