export interface NPMRegistryData {
  repositoryUrl: string | null;
  description: string;
  latestVersion: string;
  publishedDate: Date | null;
  weeklyDownloads: number;
  dependentsCount: number;
  license?: {
    spdxId: string;
    name: string;
  };
}

export async function fetchNPMRegistry(packageName: string): Promise<NPMRegistryData | null> {
  try {
    const [registryRes, downloadsRes, dependentsRes] = await Promise.allSettled([
      fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`),
      fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`),
      fetch(`https://registry.npmjs.org/-/v1/search?text=dependencies:${encodeURIComponent(packageName)}&size=1`),
    ]);

    if (registryRes.status === 'rejected' || !registryRes.value.ok) return null;
    const data = await registryRes.value.json();

    let repositoryUrl = null;
    if (data.repository) {
      repositoryUrl = typeof data.repository === 'string'
        ? data.repository
        : data.repository.url;
    }

    if (repositoryUrl) {
      repositoryUrl = repositoryUrl.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '');
      if (repositoryUrl.startsWith('ssh://git@')) {
        repositoryUrl = repositoryUrl.replace('ssh://git@', 'https://');
      }
    }

    const latestVersion = data['dist-tags']?.latest;
    const timeData = data.time || {};
    const publishedDate = timeData[latestVersion] ? new Date(timeData[latestVersion]) : null;

    // Parse license
    let parsedLicense = undefined;
    let licenseVal = data.license;
    if (!licenseVal && latestVersion && data.versions?.[latestVersion]) {
      licenseVal = data.versions[latestVersion].license;
    }
    if (licenseVal) {
      if (typeof licenseVal === 'string') {
        parsedLicense = { spdxId: licenseVal, name: `${licenseVal} License` };
      } else if (typeof licenseVal === 'object') {
        const spdxId = licenseVal.type || licenseVal.name || '';
        if (spdxId) parsedLicense = { spdxId, name: `${spdxId} License` };
      }
    }

    // Weekly downloads
    let weeklyDownloads = 0;
    if (downloadsRes.status === 'fulfilled' && downloadsRes.value.ok) {
      const dlData = await downloadsRes.value.json();
      weeklyDownloads = dlData.downloads || 0;
    }

    // Dependents count
    let dependentsCount = 0;
    if (dependentsRes.status === 'fulfilled' && dependentsRes.value.ok) {
      const depData = await dependentsRes.value.json();
      dependentsCount = depData.total || 0;
    }

    return {
      repositoryUrl,
      description: data.description || '',
      latestVersion: latestVersion || '',
      publishedDate,
      weeklyDownloads,
      dependentsCount,
      license: parsedLicense
    };
  } catch (err) {
    console.error('NPM fetch error', err);
    return null;
  }
}
