import type { GitHubStats } from '../../types/analysis';
import { useSettingsStore } from '../../store/settingsStore';

function cleanRepoName(repo: string): string {
  return repo.replace(/\.git$/, '');
}

export async function fetchGitHubStats(url: string): Promise<GitHubStats | null> {
  const token = useSettingsStore.getState().githubToken;

  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  const [_, owner, repo] = match;
  const cleanRepo = cleanRepoName(repo);

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    // Fetch repo info, contributor count, recent commits, author profile, and latest release in parallel
    const [repoRes, contribRes, commitsRes, authorRes, releaseRes] = await Promise.allSettled([
      fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/contributors?per_page=1&anon=true`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/commits?per_page=100&since=${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()}`, { headers }),
      fetch(`https://api.github.com/users/${owner}`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/releases/latest`, { headers }),
    ]);

    if (repoRes.status === 'rejected' || !repoRes.value.ok) return null;
    const data = await repoRes.value.json();

    // Contributor count from Link header
    let contributorsCount = 0;
    if (contribRes.status === 'fulfilled' && contribRes.value.ok) {
      const linkHeader = contribRes.value.headers.get('Link') || '';
      const lastPageMatch = linkHeader.match(/page=(\d+)>;\s*rel="last"/);
      if (lastPageMatch) {
        contributorsCount = parseInt(lastPageMatch[1], 10);
      } else {
        const contribData = await contribRes.value.json();
        contributorsCount = Array.isArray(contribData) ? contribData.length : 0;
      }
    }

    // Commit frequency: count commits in last 90 days.
    // Stays undefined (not 0) when the fetch fails/is rate-limited, so callers
    // can tell "no data" apart from "confirmed zero commits".
    let commitsLast90Days: number | undefined;
    if (commitsRes.status === 'fulfilled' && commitsRes.value.ok) {
      const commitsData = await commitsRes.value.json();
      commitsLast90Days = Array.isArray(commitsData) ? commitsData.length : undefined;
    }

    // Author profile
    let authorPublicRepos = 0;
    let authorFollowers = 0;
    if (authorRes.status === 'fulfilled' && authorRes.value.ok) {
      const authorData = await authorRes.value.json();
      authorPublicRepos = authorData.public_repos || 0;
      authorFollowers = authorData.followers || 0;
    }

    // Latest release
    let latestRelease: string | undefined;
    if (releaseRes.status === 'fulfilled' && releaseRes.value.ok) {
      const releaseData = await releaseRes.value.json();
      latestRelease = releaseData.tag_name || undefined;
    }

    return {
      url: data.html_url,
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      watchers: data.subscribers_count,
      archived: data.archived,
      lastCommitDate: new Date(data.pushed_at),
      createdAt: new Date(data.created_at),
      contributorsCount,
      commitsLast90Days,
      authorPublicRepos,
      authorFollowers,
      latestRelease,
      owner: {
        login: data.owner?.login || owner,
        avatarUrl: data.owner?.avatar_url || '',
        type: data.owner?.type || 'Organization'
      },
      license: data.license?.spdx_id ? {
        spdxId: data.license.spdx_id,
        name: data.license.name || `${data.license.spdx_id} License`
      } : undefined
    };
  } catch {
    return null;
  }
}
