const fs = require("fs");
const path = require("path");

const TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.GITHUB_REPOSITORY_OWNER;

if (!TOKEN || !USERNAME) {
  throw new Error(
    "Missing GITHUB_TOKEN or GITHUB_REPOSITORY_OWNER."
  );
}

const API_URL = "https://api.github.com/graphql";
const DIST_DIR = path.join(process.cwd(), "dist");

const LANGUAGE_COLORS = [
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#3B82F6",
];

/* =========================================================
   HELPERS
========================================================= */

async function githubGraphQL(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Govind-Madhav-GitHub-Stats",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(
      JSON.stringify(result.errors, null, 2)
    );
  }

  return result.data;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function ensureDist() {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

function writeSvg(filename, svg) {
  ensureDist();

  const file = path.join(DIST_DIR, filename);

  fs.writeFileSync(
    file,
    svg.trim() + "\n",
    "utf8"
  );

  console.log(`Generated: ${file}`);
}

/* =========================================================
   GITHUB DATA
========================================================= */

async function getGitHubData() {
  const query = `
    query ($login: String!) {
      user(login: $login) {

        login
        name

        repositories(
          first: 100
          ownerAffiliations: OWNER
          privacy: PUBLIC
        ) {
          totalCount

          nodes {
            name
            isFork
            stargazerCount
            forkCount

            languages(
              first: 20
              orderBy: {
                field: SIZE
                direction: DESC
              }
            ) {
              edges {
                size
                node {
                  name
                }
              }
            }
          }
        }

        contributionsCollection {

          totalCommitContributions

          totalPullRequestContributions

          totalRepositoriesWithContributedCommits

          contributionCalendar {

            totalContributions

            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const data = await githubGraphQL(query, {
    login: USERNAME,
  });

  if (!data || !data.user) {
    throw new Error(
      `GitHub user "${USERNAME}" was not found.`
    );
  }

  return data.user;
}

/* =========================================================
   OVERVIEW DATA
========================================================= */

function calculateOverview(user) {
  const repositories =
    user.repositories.nodes.filter(
      (repo) => !repo.isFork
    );

  const totalStars = repositories.reduce(
    (sum, repo) =>
      sum + repo.stargazerCount,
    0
  );

  const totalForks = repositories.reduce(
    (sum, repo) =>
      sum + repo.forkCount,
    0
  );

  const contributions =
    user.contributionsCollection;

  return {
    repositories: repositories.length,

    totalStars,

    totalForks,

    totalCommits:
      contributions.totalCommitContributions,

    totalPRs:
      contributions.totalPullRequestContributions,

    contributedTo:
      contributions
        .totalRepositoriesWithContributedCommits,

    totalContributions:
      contributions
        .contributionCalendar
        .totalContributions,

    calendar:
      contributions.contributionCalendar,
  };
}

/* =========================================================
   LANGUAGE DATA
========================================================= */

function calculateLanguages(user) {
  const languageBytes = {};

  for (const repo of user.repositories.nodes) {
    if (repo.isFork) continue;

    for (const edge of repo.languages.edges) {
      const language = edge.node.name;

      languageBytes[language] =
        (languageBytes[language] || 0) +
        edge.size;
    }
  }

  const totalBytes = Object.values(
    languageBytes
  ).reduce(
    (sum, bytes) => sum + bytes,
    0
  );

  if (!totalBytes) {
    return [];
  }

  return Object.entries(languageBytes)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percentage:
        (bytes / totalBytes) * 100,
    }))
    .sort(
      (a, b) => b.bytes - a.bytes
    )
    .slice(0, 4);
}

/* =========================================================
   STREAK DATA
========================================================= */

function calculateStreak(calendar) {
  const days = [];

  for (const week of calendar.weeks) {
    for (const day of week.contributionDays) {
      days.push({
        date: day.date,
        count: day.contributionCount,
      });
    }
  }

  days.sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  /*
   * Current streak
   *
   * If the latest day has no contribution,
   * start from the previous day.
   */

  let index = days.length - 1;

  if (
    index >= 0 &&
    days[index].count === 0
  ) {
    index--;
  }

  let currentStreak = 0;

  while (
    index >= 0 &&
    days[index].count > 0
  ) {
    currentStreak++;
    index--;
  }

  /*
   * Longest streak
   */

  let longestStreak = 0;
  let runningStreak = 0;

  for (const day of days) {
    if (day.count > 0) {
      runningStreak++;

      if (
        runningStreak >
        longestStreak
      ) {
        longestStreak =
          runningStreak;
      }
    } else {
      runningStreak = 0;
    }
  }

  return {
    currentStreak,
    longestStreak,
  };
}

/* =========================================================
   OVERVIEW SVG
========================================================= */

function generateOverviewSvg(stats) {
  return `
<svg
  width="495"
  height="195"
  viewBox="0 0 495 195"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>

<style>
  .header {
    font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #F59E0B;
  }

  .label {
    font: 600 10px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #71717A;
    letter-spacing: 0.05em;
  }

  .value {
    font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #FFFFFF;
  }

  .green {
    font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #10B981;
  }

  .amber {
    font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #F59E0B;
  }

  .card {
    fill: #0A0A0A;
    stroke: #262626;
    stroke-width: 1;
  }

  .box {
    fill: #121212;
    stroke: #1F1F1F;
    stroke-width: 1;
  }
</style>

<rect
  class="card"
  x="1"
  y="1"
  width="493"
  height="193"
  rx="12"
/>

<text
  x="24"
  y="32"
  class="header"
>
  GOVIND-MADHAV'S GITHUB OVERVIEW
</text>

<circle
  cx="465"
  cy="28"
  r="4"
  fill="#10B981"
/>

<!-- STARS -->

<rect
  class="box"
  x="24"
  y="48"
  width="215"
  height="58"
  rx="8"
/>

<text
  x="40"
  y="72"
  class="label"
>
  TOTAL STARS
</text>

<text
  x="40"
  y="92"
  class="value"
>
  ${stats.totalStars}
</text>


<!-- COMMITS -->

<rect
  class="box"
  x="255"
  y="48"
  width="215"
  height="58"
  rx="8"
/>

<text
  x="271"
  y="72"
  class="label"
>
  COMMITS · 1 YEAR
</text>

<text
  x="271"
  y="92"
  class="green"
>
  ${stats.totalCommits}
</text>


<!-- PRS + FORKS -->

<rect
  class="box"
  x="24"
  y="118"
  width="215"
  height="58"
  rx="8"
/>

<text
  x="40"
  y="142"
  class="label"
>
  PRS · FORKS
</text>

<text
  x="40"
  y="162"
  class="value"
>
  ${stats.totalPRs} · ${stats.totalForks}
</text>


<!-- CONTRIBUTED TO -->

<rect
  class="box"
  x="255"
  y="118"
  width="215"
  height="58"
  rx="8"
/>

<text
  x="271"
  y="142"
  class="label"
>
  CONTRIBUTED TO
</text>

<text
  x="271"
  y="162"
  class="amber"
>
  ${stats.contributedTo} repos
</text>

</svg>
`;
}

/* =========================================================
   LANGUAGES SVG
========================================================= */

function generateLanguagesSvg(languages) {
  const topLanguages =
    languages.slice(0, 4);

  if (topLanguages.length === 0) {
    return `
<svg
  width="495"
  height="195"
  viewBox="0 0 495 195"
  xmlns="http://www.w3.org/2000/svg"
>
  <rect
    x="1"
    y="1"
    width="493"
    height="193"
    rx="12"
    fill="#0A0A0A"
    stroke="#262626"
  />

  <text
    x="24"
    y="32"
    fill="#F59E0B"
    font-family="Segoe UI, Ubuntu, sans-serif"
    font-size="16"
    font-weight="700"
  >
    MOST USED LANGUAGES
  </text>

  <text
    x="24"
    y="75"
    fill="#71717A"
    font-family="Segoe UI, Ubuntu, sans-serif"
    font-size="12"
  >
    No language data available
  </text>
</svg>
`;
  }

  const totalDisplayed =
    topLanguages.reduce(
      (sum, language) =>
        sum + language.percentage,
      0
    );

  let currentX = 0;

  const barSegments =
    topLanguages
      .map((language, index) => {
        const width =
          index ===
            topLanguages.length - 1
            ? 446 - currentX
            : (language.percentage /
              totalDisplayed) *
            446;

        const segment = `
<rect
  x="${currentX.toFixed(2)}"
  y="0"
  width="${width.toFixed(2)}"
  height="10"
  fill="${LANGUAGE_COLORS[index]}"
/>`;

        currentX += width;

        return segment;
      })
      .join("");

  const cards =
    topLanguages
      .map((language, index) => {
        const column =
          index % 2;

        const row =
          Math.floor(index / 2);

        const x =
          column === 0
            ? 0
            : 231;

        const y =
          row * 40;

        return `
<g transform="translate(${x}, ${y})">

  <rect
    class="box"
    x="0"
    y="0"
    width="215"
    height="34"
    rx="8"
  />

  <circle
    cx="16"
    cy="17"
    r="4"
    fill="${LANGUAGE_COLORS[index]}"
  />

  <text
    x="28"
    y="21"
    class="lang-name"
  >
    ${escapeXml(language.name)}
  </text>

  <text
    x="198"
    y="21"
    class="lang-percent"
    fill="${LANGUAGE_COLORS[index]}"
    text-anchor="end"
  >
    ${language.percentage.toFixed(1)}%
  </text>

</g>`;
      })
      .join("");

  return `
<svg
  width="495"
  height="195"
  viewBox="0 0 495 195"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>

<style>

  .header {
    font: 700 16px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #F59E0B;
  }

  .subtitle {
    font: 600 10px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #71717A;
    letter-spacing: 0.05em;
  }

  .lang-name {
    font: 600 12px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #E4E4E7;
  }

  .lang-percent {
    font: 700 12px 'Segoe UI', Ubuntu, Sans-Serif;
  }

  .card {
    fill: #0A0A0A;
    stroke: #262626;
    stroke-width: 1;
  }

  .box {
    fill: #121212;
    stroke: #1F1F1F;
    stroke-width: 1;
  }

</style>

<rect
  class="card"
  x="1"
  y="1"
  width="493"
  height="193"
  rx="12"
/>

<text
  x="24"
  y="32"
  class="header"
>
  MOST USED LANGUAGES
</text>

<text
  x="471"
  y="32"
  class="subtitle"
  text-anchor="end"
>
  LIVE STACK
</text>

<!-- LANGUAGE BAR -->

<rect
  x="24"
  y="48"
  width="446"
  height="10"
  fill="#171717"
  rx="5"
/>

<g transform="translate(24, 48)">
  ${barSegments}
</g>

<!-- LANGUAGE CARDS -->

<g transform="translate(24, 72)">
  ${cards}
</g>

</svg>
`;
}

/* =========================================================
   STREAK SVG
========================================================= */

function generateStreakSvg(
  streak,
  stats
) {
  return `
<svg
  width="1000"
  height="150"
  viewBox="0 0 1000 150"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>

<style>

  .header {
    font: 700 17px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #F59E0B;
  }

  .label {
    font: 600 11px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #71717A;
    letter-spacing: 0.05em;
  }

  .value {
    font: 700 25px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #FFFFFF;
  }

  .green {
    font: 700 25px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #10B981;
  }

  .amber {
    font: 700 25px 'Segoe UI', Ubuntu, Sans-Serif;
    fill: #F59E0B;
  }

  .card {
    fill: #0A0A0A;
    stroke: #262626;
    stroke-width: 1;
  }

</style>

<rect
  class="card"
  x="1"
  y="1"
  width="998"
  height="148"
  rx="12"
/>

<text
  x="28"
  y="34"
  class="header"
>
  GITHUB CONTRIBUTION STREAK
</text>

<circle
  cx="970"
  cy="30"
  r="4"
  fill="#10B981"
/>


<!-- CURRENT STREAK -->

<text
  x="28"
  y="70"
  class="label"
>
  CURRENT STREAK
</text>

<text
  x="28"
  y="103"
  class="green"
>
  ${streak.currentStreak} DAYS
</text>


<!-- LONGEST STREAK -->

<text
  x="278"
  y="70"
  class="label"
>
  LONGEST STREAK
</text>

<text
  x="278"
  y="103"
  class="amber"
>
  ${streak.longestStreak} DAYS
</text>


<!-- CONTRIBUTIONS -->

<text
  x="528"
  y="70"
  class="label"
>
  CONTRIBUTIONS · 1 YEAR
</text>

<text
  x="528"
  y="103"
  class="value"
>
  ${stats.totalContributions}
</text>


<!-- COMMITS -->

<text
  x="768"
  y="70"
  class="label"
>
  COMMITS · 1 YEAR
</text>

<text
  x="768"
  y="103"
  class="value"
>
  ${stats.totalCommits}
</text>

</svg>
`;
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    " Govind-Madhav GitHub Stats Generator"
  );
  console.log(
    "=============================================="
  );
  console.log("");

  console.log(
    `Username: ${USERNAME}`
  );

  console.log(
    "Fetching GitHub data..."
  );

  const user =
    await getGitHubData();

  const stats =
    calculateOverview(user);

  const languages =
    calculateLanguages(user);

  const streak =
    calculateStreak(stats.calendar);

  console.log("");
  console.log(
    "GitHub statistics:"
  );
  console.log(
    "----------------------------------------------"
  );

  console.log(
    `Repositories       : ${stats.repositories}`
  );

  console.log(
    `Stars              : ${stats.totalStars}`
  );

  console.log(
    `Forks              : ${stats.totalForks}`
  );

  console.log(
    `Commits (1 year)   : ${stats.totalCommits}`
  );

  console.log(
    `Pull Requests      : ${stats.totalPRs}`
  );

  console.log(
    `Contributed to     : ${stats.contributedTo}`
  );

  console.log(
    `Contributions      : ${stats.totalContributions}`
  );

  console.log(
    `Current streak     : ${streak.currentStreak} days`
  );

  console.log(
    `Longest streak     : ${streak.longestStreak} days`
  );

  console.log("");
  console.log(
    "Languages:"
  );

  console.log(
    "----------------------------------------------"
  );

  for (const language of languages) {
    console.log(
      `${language.name.padEnd(18)} ${language.percentage.toFixed(1)}%`
    );
  }

  console.log("");
  console.log(
    "Generating SVG cards..."
  );

  writeSvg(
    "github-overview.svg",
    generateOverviewSvg(stats)
  );

  writeSvg(
    "github-languages.svg",
    generateLanguagesSvg(languages)
  );

  writeSvg(
    "github-streak.svg",
    generateStreakSvg(
      streak,
      stats
    )
  );

  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    " SVG generation completed successfully."
  );
  console.log(
    "=============================================="
  );
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error(
    "Generation failed:"
  );
  console.error(error);
  process.exit(1);
});