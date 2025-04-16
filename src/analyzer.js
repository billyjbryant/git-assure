// This file contains the main logic for analyzing GitHub repositories.
// It exports the function `analyzeGitHubRepository(repoUrl)` which takes a repository URL as input and returns an analysis summary, risk score, and risk rating.

const fetch = require('node-fetch');
const semver = require('semver'); // Add this dependency to package.json

async function analyzeGitHubRepository(repoUrl) {
  try {
    const parts = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!parts || parts.length !== 3) {
      return {
        markdownSummary: 'Error: Invalid GitHub repository URL.',
        riskScore: 'N/A'
      };
    }
    const owner = parts[1];
    const repo = parts[2].replace(/\.git$/, ''); // Remove potential .git extension
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

    // --- Configure Authentication Headers ---
    const headers = {
      Accept: 'application/vnd.github.v3+json'
    };

    // Use GitHub token if available
    const githubToken = process.env.GH_TOKEN;
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`;
      console.log('Using GitHub authentication token');
    } else {
      console.log('No GitHub token found. Using unauthenticated requests (rate limits apply)');
    }

    // --- Helper Function for Authenticated Requests ---
    const fetchWithAuth = url => fetch(url, { headers });

    // --- Fetch Basic Repository Information ---
    const repoInfoResponse = await fetchWithAuth(apiUrl);
    if (!repoInfoResponse.ok) {
      return {
        markdownSummary: `Error fetching repository information (status ${repoInfoResponse.status}): ${repoInfoResponse.statusText}`,
        riskScore: 'N/A'
      };
    }
    const repoInfo = await repoInfoResponse.json();

    const createdAt = new Date(repoInfo.created_at);
    const updatedAt = new Date(repoInfo.updated_at);
    const ageInDays = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24));

    // --- Get Community Metrics ---
    const starCount = repoInfo.stargazers_count;
    const forkCount = repoInfo.forks_count;
    const watcherCount = repoInfo.subscribers_count;
    const openIssuesCount = repoInfo.open_issues_count;

    // --- Get License Information ---
    let license = 'Unknown';
    let licenseRisk = 'Medium';

    if (repoInfo.license && repoInfo.license.name) {
      license = repoInfo.license.name;

      // Assess license risk (permissive licenses are lower risk)
      const permissiveLicenses = ['MIT', 'Apache', 'BSD', 'ISC', 'CC0'];
      const restrictiveLicenses = ['GPL', 'AGPL', 'LGPL', 'MPL'];

      if (permissiveLicenses.some(l => license.includes(l))) {
        licenseRisk = 'Low';
      } else if (restrictiveLicenses.some(l => license.includes(l))) {
        licenseRisk = 'Medium';
      } else if (license.includes('Proprietary') || license === 'UNLICENSED') {
        licenseRisk = 'High';
      }
    }

    // --- Fetch Contributors ---
    const contributorsResponse = await fetchWithAuth(`${apiUrl}/contributors`);
    const contributors = await contributorsResponse.json();
    const numberOfContributors = contributors.length;

    // --- Fetch Contributor Details ---
    let totalContributorAge = 0;
    let processedContributors = 0;

    // Process up to 10 top contributors to avoid API rate limits
    const contributorsToProcess = contributors.slice(0, 10);

    for (const contributor of contributorsToProcess) {
      try {
        const userResponse = await fetchWithAuth(contributor.url);
        if (userResponse.ok) {
          const userData = await userResponse.json();
          const userCreatedAt = new Date(userData.created_at);
          const userAgeInDays = Math.floor((Date.now() - userCreatedAt) / (1000 * 60 * 60 * 24));
          totalContributorAge += userAgeInDays;
          processedContributors++;
        }
      } catch (error) {
        console.warn(`Could not fetch details for contributor: ${contributor.login}`);
      }
    }

    const averageContributorAgeInDays =
      processedContributors > 0 ? Math.floor(totalContributorAge / processedContributors) : null;
    const averageContributorAgeInYears = averageContributorAgeInDays
      ? (averageContributorAgeInDays / 365).toFixed(1)
      : null;

    // --- Check for Dependencies Info ---
    const packageJsonResponse = await fetchWithAuth(`${apiUrl}/contents/package.json`);
    const packageLockResponse = await fetchWithAuth(`${apiUrl}/contents/package-lock.json`);
    const requirementsResponse = await fetchWithAuth(`${apiUrl}/contents/requirements.txt`);
    const gemfileResponse = await fetchWithAuth(`${apiUrl}/contents/Gemfile`);
    const gradleResponse = await fetchWithAuth(`${apiUrl}/contents/build.gradle`);
    const mavenResponse = await fetchWithAuth(`${apiUrl}/contents/pom.xml`);

    const hasDependencyFile = [
      packageJsonResponse,
      packageLockResponse,
      requirementsResponse,
      gemfileResponse,
      gradleResponse,
      mavenResponse
    ].some(response => response.ok);

    // --- Analyze Dependencies for Vulnerabilities ---
    let dependencyAnalysis = {
      hasDependencies: hasDependencyFile,
      dependenciesCount: 0,
      parsedDependencies: [],
      outdatedDependencies: [],
      majorOutdatedCount: 0,
      minorOutdatedCount: 0,
      vulnerablePackages: [],
      alertsEnabled: false,
      highSeverityCount: null,
      mediumSeverityCount: null,
      lowSeverityCount: null,
      vulnerabilitySource: null
    };

    // Check if vulnerability alerts are enabled (requires OAuth token with right permissions)
    if (githubToken) {
      try {
        const alertsResponse = await fetch(`${apiUrl}/vulnerability-alerts`, {
          method: 'GET',
          headers: {
            ...headers,
            Accept: 'application/vnd.github.dorian-preview+json'
          }
        });

        dependencyAnalysis.alertsEnabled = alertsResponse.status === 204;

        // Try to get actual vulnerability alerts (requires permissions)
        if (dependencyAnalysis.alertsEnabled) {
          const dependabotAlertsResponse = await fetch(`${apiUrl}/dependabot/alerts?state=open`, {
            headers: {
              ...headers,
              Accept: 'application/vnd.github.dorian-preview+json'
            }
          });

          if (dependabotAlertsResponse.ok) {
            const alerts = await dependabotAlertsResponse.json();

            // Count by severity
            const severityCounts = {
              high: 0,
              medium: 0,
              low: 0
            };

            const vulnerablePackages = [];

            alerts.forEach(alert => {
              // Count by severity
              if (alert.security_vulnerability && alert.security_vulnerability.severity) {
                const severity = alert.security_vulnerability.severity.toLowerCase();
                if (severity in severityCounts) {
                  severityCounts[severity]++;
                }
              }

              // Track vulnerable packages
              if (alert.security_advisory && alert.security_advisory.vulnerabilities) {
                alert.security_advisory.vulnerabilities.forEach(vuln => {
                  if (vuln.package && vuln.package.name) {
                    vulnerablePackages.push({
                      name: vuln.package.name,
                      severity: vuln.severity || 'unknown',
                      fixedIn: vuln.patched_versions || 'unknown'
                    });
                  }
                });
              }
            });

            dependencyAnalysis.highSeverityCount = severityCounts.high;
            dependencyAnalysis.mediumSeverityCount = severityCounts.medium;
            dependencyAnalysis.lowSeverityCount = severityCounts.low;
            dependencyAnalysis.vulnerablePackages = vulnerablePackages;
          }
        }
      } catch (error) {
        console.warn('Could not check vulnerability alerts:', error.message);
      }
    }

    // Parse dependencies from package.json if available
    if (packageJsonResponse.ok) {
      try {
        const contentResponse = await packageJsonResponse.json();

        if (contentResponse.content) {
          const content = Buffer.from(contentResponse.content, 'base64').toString('utf8');
          const packageJson = JSON.parse(content);

          // Combine all dependencies
          const allDeps = {
            ...(packageJson.dependencies || {}),
            ...(packageJson.devDependencies || {})
          };

          dependencyAnalysis.dependenciesCount = Object.keys(allDeps).length;

          // Extract dependency info
          dependencyAnalysis.parsedDependencies = Object.entries(allDeps)
            .map(([name, version]) => ({
              name,
              version: version.replace(/[^0-9.]/g, '') // Clean up version string
            }))
            .slice(0, 20); // Limit to top 20 to avoid too much data
        }
      } catch (error) {
        console.warn('Could not parse package.json:', error.message);
      }
    }

    // Parse Python requirements if available
    if (requirementsResponse.ok && dependencyAnalysis.parsedDependencies.length === 0) {
      try {
        const contentResponse = await requirementsResponse.json();

        if (contentResponse.content) {
          const content = Buffer.from(contentResponse.content, 'base64').toString('utf8');

          // Simple regex to extract package==version
          const requirements = content
            .split('\n')
            .map(line => {
              const match = line.match(/^([a-zA-Z0-9_.-]+)[=~!<>]{1,2}([0-9a-zA-Z.-]+)/);
              return match ? { name: match[1], version: match[2] } : null;
            })
            .filter(Boolean);

          dependencyAnalysis.dependenciesCount = requirements.length;
          dependencyAnalysis.parsedDependencies = requirements.slice(0, 20); // Limit to top 20
        }
      } catch (error) {
        console.warn('Could not parse requirements.txt:', error.message);
      }
    }

    // --- Check for Vulnerability Information via OSV Database ---
    if (dependencyAnalysis.parsedDependencies.length > 0) {
      try {
        console.log('Checking OSV database for vulnerabilities...');

        // Determine ecosystem based on detected files
        let ecosystem = null;
        if (packageJsonResponse.ok) {
          ecosystem = 'npm';
        } else if (requirementsResponse.ok) {
          ecosystem = 'PyPI';
        } else if (mavenResponse.ok) {
          ecosystem = 'Maven';
        }

        if (ecosystem) {
          // Process dependencies in batches to avoid overloading the API
          const batchSize = 10;
          const batches = [];

          for (let i = 0; i < dependencyAnalysis.parsedDependencies.length; i += batchSize) {
            batches.push(dependencyAnalysis.parsedDependencies.slice(i, i + batchSize));
          }

          let osvVulnerabilities = [];

          for (const batch of batches) {
            const vulnerabilityPromises = batch.map(async dep => {
              try {
                // Query OSV API for each dependency
                const osvApiUrl = 'https://api.osv.dev/v1/query';
                const response = await fetch(osvApiUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    package: {
                      name: dep.name,
                      ecosystem: ecosystem
                    },
                    version: dep.version
                  })
                });

                if (response.ok) {
                  const data = await response.json();
                  if (data.vulns && data.vulns.length > 0) {
                    // Process and return vulnerabilities
                    return data.vulns.map(vuln => ({
                      package: dep.name,
                      version: dep.version,
                      id: vuln.id,
                      details: vuln.summary || 'No summary provided',
                      severity: determineSeverity(vuln),
                      fixedIn: extractFixedVersions(vuln)
                    }));
                  }
                }
                return [];
              } catch (err) {
                console.warn(
                  `Error checking vulnerability for ${dep.name}@${dep.version}:`,
                  err.message
                );
                return [];
              }
            });

            // Wait for all vulnerability checks in this batch
            const batchResults = await Promise.all(vulnerabilityPromises);
            osvVulnerabilities = osvVulnerabilities.concat(batchResults.flat());

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          // Count vulnerabilities by severity
          const highSeverityVulns = osvVulnerabilities.filter(v => v.severity === 'HIGH').length;
          const mediumSeverityVulns = osvVulnerabilities.filter(
            v => v.severity === 'MEDIUM'
          ).length;
          const lowSeverityVulns = osvVulnerabilities.filter(v => v.severity === 'LOW').length;

          // Only update counts if we found vulnerabilities via OSV and don't already have GHAS data
          if (
            osvVulnerabilities.length > 0 &&
            dependencyAnalysis.highSeverityCount === 0 &&
            dependencyAnalysis.mediumSeverityCount === 0 &&
            dependencyAnalysis.lowSeverityCount === 0
          ) {
            dependencyAnalysis.highSeverityCount = highSeverityVulns;
            dependencyAnalysis.mediumSeverityCount = mediumSeverityVulns;
            dependencyAnalysis.lowSeverityCount = lowSeverityVulns;
            dependencyAnalysis.vulnerablePackages = osvVulnerabilities.map(v => ({
              name: v.package,
              severity: v.severity,
              fixedIn: v.fixedIn,
              id: v.id,
              details: v.details
            }));
            dependencyAnalysis.vulnerabilitySource = 'OSV';
          }
        }
      } catch (error) {
        console.warn('Could not check OSV for vulnerabilities:', error.message);
      }
    }

    // --- Check for outdated dependencies ---
    if (dependencyAnalysis.parsedDependencies.length > 0) {
      try {
        console.log('Checking for outdated dependencies...');

        // Determine package registry based on detected ecosystem
        let ecosystem = null;
        if (packageJsonResponse.ok) {
          ecosystem = 'npm';
        } else if (requirementsResponse.ok) {
          ecosystem = 'PyPI';
        }

        if (ecosystem) {
          // Process dependencies in batches to avoid overloading the API
          const batchSize = 5;
          const batches = [];

          for (let i = 0; i < dependencyAnalysis.parsedDependencies.length; i += batchSize) {
            batches.push(dependencyAnalysis.parsedDependencies.slice(i, i + batchSize));
          }

          for (const batch of batches) {
            const versionPromises = batch.map(async dep => {
              try {
                let latestVersion = null;

                // Check npm registry for JavaScript packages
                if (ecosystem === 'npm') {
                  const npmResponse = await fetch(
                    `https://registry.npmjs.org/${encodeURIComponent(dep.name)}/latest`
                  );
                  if (npmResponse.ok) {
                    const npmData = await npmResponse.json();
                    latestVersion = npmData.version;
                  }
                }
                // Check PyPI for Python packages
                else if (ecosystem === 'PyPI') {
                  const pypiResponse = await fetch(
                    `https://pypi.org/pypi/${encodeURIComponent(dep.name)}/json`
                  );
                  if (pypiResponse.ok) {
                    const pypiData = await pypiResponse.json();
                    latestVersion = pypiData.info.version;
                  }
                }

                if (latestVersion && dep.version) {
                  // Clean up version strings for proper comparison
                  const cleanCurrentVersion = dep.version.replace(/[^0-9.]/g, '');
                  const cleanLatestVersion = latestVersion.replace(/[^0-9.]/g, '');

                  // Only process if we have valid versions
                  if (
                    semver.valid(semver.coerce(cleanCurrentVersion)) &&
                    semver.valid(semver.coerce(cleanLatestVersion))
                  ) {
                    // Calculate version difference
                    const currentSemver = semver.coerce(cleanCurrentVersion);
                    const latestSemver = semver.coerce(cleanLatestVersion);

                    const isMajorBehind = semver.major(latestSemver) > semver.major(currentSemver);
                    const isMinorBehind =
                      semver.major(latestSemver) === semver.major(currentSemver) &&
                      semver.minor(latestSemver) > semver.minor(currentSemver);
                    const isPatchBehind =
                      semver.major(latestSemver) === semver.major(currentSemver) &&
                      semver.minor(latestSemver) === semver.minor(currentSemver) &&
                      semver.patch(latestSemver) > semver.patch(currentSemver);

                    const versionsBehind = {
                      major: semver.major(latestSemver) - semver.major(currentSemver),
                      minor: isMinorBehind
                        ? semver.minor(latestSemver) - semver.minor(currentSemver)
                        : 0,
                      patch: isPatchBehind
                        ? semver.patch(latestSemver) - semver.patch(currentSemver)
                        : 0
                    };

                    // Return outdated info if package is behind
                    if (isMajorBehind || isMinorBehind || isPatchBehind) {
                      return {
                        name: dep.name,
                        currentVersion: cleanCurrentVersion,
                        latestVersion: cleanLatestVersion,
                        isMajorBehind,
                        isMinorBehind,
                        isPatchBehind,
                        versionsBehind,
                        updateUrgency: isMajorBehind ? 'high' : isMinorBehind ? 'medium' : 'low'
                      };
                    }
                  }
                }
                return null;
              } catch (err) {
                console.warn(`Error checking latest version for ${dep.name}:`, err.message);
                return null;
              }
            });

            // Wait for all version checks in this batch
            const batchResults = await Promise.all(versionPromises);
            const outdatedInBatch = batchResults.filter(Boolean);
            dependencyAnalysis.outdatedDependencies = [
              ...dependencyAnalysis.outdatedDependencies,
              ...outdatedInBatch
            ];

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          // Count outdated dependencies by severity
          dependencyAnalysis.majorOutdatedCount = dependencyAnalysis.outdatedDependencies.filter(
            dep => dep.isMajorBehind
          ).length;

          dependencyAnalysis.minorOutdatedCount = dependencyAnalysis.outdatedDependencies.filter(
            dep => !dep.isMajorBehind && dep.isMinorBehind
          ).length;
        }
      } catch (error) {
        console.warn('Could not check for outdated dependencies:', error.message);
      }
    }

    // --- Check for Test Files ---
    const testDirResponses = await Promise.all([
      fetchWithAuth(`${apiUrl}/contents/tests`),
      fetchWithAuth(`${apiUrl}/contents/test`),
      fetchWithAuth(`${apiUrl}/contents/__tests__`),
      fetchWithAuth(`${apiUrl}/contents/spec`)
    ]);

    const hasTestDirectory = testDirResponses.some(response => response.ok);

    // --- Check for CI/CD Setup ---
    const ciConfigResponses = await Promise.all([
      fetchWithAuth(`${apiUrl}/contents/.github/workflows`),
      fetchWithAuth(`${apiUrl}/contents/.travis.yml`),
      fetchWithAuth(`${apiUrl}/contents/.gitlab-ci.yml`),
      fetchWithAuth(`${apiUrl}/contents/azure-pipelines.yml`),
      fetchWithAuth(`${apiUrl}/contents/Jenkinsfile`),
      fetchWithAuth(`${apiUrl}/contents/.circleci/config.yml`)
    ]);

    const hasCiSetup = ciConfigResponses.some(response => response.ok);

    // --- Check Documentation Quality ---
    const readmeResponse = await fetchWithAuth(`${apiUrl}/contents/README.md`);
    const hasReadme = readmeResponse.ok;

    // Get README excerpt if available
    let readmeExcerpt = null;
    let readmeUrl = null;

    if (hasReadme) {
      try {
        const readmeData = await readmeResponse.json();
        readmeUrl = readmeData.html_url; // GitHub URL to view the full README

        // Decode README content if not too large
        if (readmeData.content && readmeData.size < 100000) {
          // avoid trying to process huge READMEs
          const fullReadme = Buffer.from(readmeData.content, 'base64').toString('utf8');

          // Remove code blocks first
          const readmeWithoutCode = fullReadme
            .replace(/```[\s\S]*?```/g, '') // Remove fenced code blocks with ```
            .replace(/~~~[\s\S]*?~~~/g, '') // Remove fenced code blocks with ~~~
            .replace(/`[^`]+`/g, ''); // Remove inline code

          // Extract a meaningful excerpt (first few paragraphs, limited to ~500 chars)
          const paragraphs = readmeWithoutCode.split('\n\n');
          let excerpt = '';

          // Start with the first paragraph that's not just a heading or badges
          for (const paragraph of paragraphs) {
            const trimmed = paragraph.trim();

            // Skip if paragraph meets any of these conditions
            if (
              trimmed.startsWith('#') || // Skip headings
              trimmed.length <= 20 || // Skip very short lines
              trimmed.match(/^[-*]/) || // Skip list items
              // Skip badge/shield lines (more precise detection)
              /!\[.*?\]\(.*?badge.*?\)/i.test(trimmed) || // Badge image links
              /!\[.*?\]\(.*?shield.*?\)/i.test(trimmed) || // Shield image links
              /\[!\[.*?\]\(.*?\)\]\(.*?\)/i.test(trimmed) || // Linked badge pattern
              // Skip lines with multiple image links (likely badge rows)
              (trimmed.match(/!\[/g) && trimmed.match(/!\[/g).length > 1) ||
              // Skip lines that are mostly image links and little text
              (trimmed.match(/!\[/g) && trimmed.match(/!\[/g).length / trimmed.length > 0.1)
            ) {
              continue;
            }

            excerpt = trimmed;
            break;
          }

          // If we didn't find a good first paragraph, use the first non-empty one
          if (!excerpt && paragraphs.length > 0) {
            for (const paragraph of paragraphs) {
              const trimmed = paragraph.trim();
              if (trimmed.length > 20 && !trimmed.startsWith('#')) {
                excerpt = trimmed;
                break;
              }
            }
          }

          // Limit excerpt length and clean it up
          if (excerpt.length > 500) {
            excerpt = excerpt.substring(0, 500) + '...';
          }

          // Clean up any remaining markdown artifacts
          excerpt = excerpt
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace [text](link) with just text
            .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold formatting
            .replace(/\*([^*]+)\*/g, '$1') // Remove italic formatting
            .replace(/_{2,}/g, '') // Remove horizontal rules
            .replace(/\n+/g, ' ') // Replace multiple newlines with spaces
            .trim();

          readmeExcerpt = excerpt;
        }
      } catch (error) {
        console.warn('Could not parse README:', error.message);
      }
    }

    const docsResponses = await Promise.all([
      fetchWithAuth(`${apiUrl}/contents/docs`),
      fetchWithAuth(`${apiUrl}/contents/documentation`),
      fetchWithAuth(`${apiUrl}/contents/wiki`)
    ]);

    const hasDocDirectory = docsResponses.some(response => response.ok);

    // --- Check Code Quality Tools ---
    const codeQualityResponses = await Promise.all([
      fetchWithAuth(`${apiUrl}/contents/.eslintrc`),
      fetchWithAuth(`${apiUrl}/contents/.eslintrc.js`),
      fetchWithAuth(`${apiUrl}/contents/.eslintrc.json`),
      fetchWithAuth(`${apiUrl}/contents/.prettierrc`),
      fetchWithAuth(`${apiUrl}/contents/.prettierrc.js`),
      fetchWithAuth(`${apiUrl}/contents/.prettierrc.json`),
      fetchWithAuth(`${apiUrl}/contents/.stylelintrc`),
      fetchWithAuth(`${apiUrl}/contents/.pylintrc`),
      fetchWithAuth(`${apiUrl}/contents/tslint.json`),
      fetchWithAuth(`${apiUrl}/contents/.rubocop.yml`)
    ]);

    const hasCodeQualityTools = codeQualityResponses.some(response => response.ok);

    // --- Check for Releases ---
    const releasesResponse = await fetchWithAuth(`${apiUrl}/releases`);
    let releaseInfo = {
      hasReleases: false,
      releaseCount: 0,
      latestReleaseDate: null,
      daysSinceLastRelease: null,
      usesSemanticVersioning: false
    };

    if (releasesResponse.ok) {
      const releases = await releasesResponse.json();
      releaseInfo.hasReleases = releases.length > 0;
      releaseInfo.releaseCount = releases.length;

      if (releases.length > 0) {
        const latestRelease = releases[0];
        releaseInfo.latestReleaseDate = new Date(latestRelease.published_at);
        releaseInfo.daysSinceLastRelease = Math.floor(
          (Date.now() - releaseInfo.latestReleaseDate) / (1000 * 60 * 60 * 24)
        );

        // Check if using semver (e.g., v1.0.0)
        const semverRegex = /^v?\d+\.\d+\.\d+(-.*)?$/;
        releaseInfo.usesSemanticVersioning = semverRegex.test(latestRelease.tag_name);
      }
    }

    // --- Fetch Commit Activity (rough estimate of frequency) ---
    const commitsResponse = await fetchWithAuth(`${apiUrl}/commits?per_page=100`); // Get last 100 commits
    const commits = await commitsResponse.json();
    const numberOfCommits = commits.length;
    const lastCommitDate = commits.length > 0 ? new Date(commits[0].commit.author.date) : null;
    const daysSinceLastCommit = lastCommitDate
      ? Math.floor((Date.now() - lastCommitDate) / (1000 * 60 * 60 * 24))
      : null;

    // --- Check for Contributing Guidelines ---
    const contributingResponse = await fetchWithAuth(`${apiUrl}/contents/CONTRIBUTING.md`);
    const hasContributingGuidelines = contributingResponse.ok;

    // --- Fetch Security Information (Limited via API) ---
    const securityFileResponses = await Promise.all([
      fetchWithAuth(`${apiUrl}/contents/SECURITY.md`),
      fetchWithAuth(`${apiUrl}/contents/SECURITY.txt`)
    ]);
    const hasSecurityPolicy = securityFileResponses.some(response => response.ok);

    // --- Fetch Open Pull Requests ---
    const pullsResponse = await fetchWithAuth(`${apiUrl}/pulls?state=open`);
    const openPulls = await pullsResponse.json();
    const longLivingPulls = openPulls.filter(pull => {
      const createdDate = new Date(pull.created_at);
      const ageInDays = Math.floor((Date.now() - createdDate) / (1000 * 60 * 60 * 24));
      return ageInDays > 90; // Consider PRs open for more than 90 days as long-lived
    });

    // --- Fetch Open Issues ---
    const issuesResponse = await fetchWithAuth(
      `${apiUrl}/issues?state=open&sort=created&direction=asc`
    );
    const openIssues = await issuesResponse.json();
    // Filter out pull requests from the issues list
    const actualOpenIssues = openIssues.filter(issue => !issue.pull_request);
    const longLivingIssues = actualOpenIssues.filter(issue => {
      const createdDate = new Date(issue.created_at);
      const ageInDays = Math.floor((Date.now() - createdDate) / (1000 * 60 * 60 * 24));
      return ageInDays > 180; // Consider issues open for more than 180 days as long-lived
    });

    // --- Calculate Response Time Metrics ---
    let responseTimeMetrics = null;

    if (actualOpenIssues && actualOpenIssues.length > 0) {
      // Get a sample of recently closed issues to check response time
      const closedIssuesResponse = await fetchWithAuth(
        `${apiUrl}/issues?state=closed&sort=updated&direction=desc&per_page=30`
      );

      if (closedIssuesResponse.ok) {
        const closedIssues = await closedIssuesResponse.json();
        const issuesWithComments = [];

        // Get response times for a sample of issues
        for (const issue of closedIssues.slice(0, 10)) {
          if (!issue.pull_request) {
            // Exclude PRs from this analysis
            const commentsResponse = await fetchWithAuth(issue.comments_url);
            if (commentsResponse.ok) {
              const comments = await commentsResponse.json();
              if (comments.length > 0) {
                const createdDate = new Date(issue.created_at);
                const firstResponseDate = new Date(comments[0].created_at);
                const responseTimeHours = Math.floor(
                  (firstResponseDate - createdDate) / (1000 * 60 * 60)
                );

                issuesWithComments.push({
                  number: issue.number,
                  responseTimeHours
                });
              }
            }
          }
        }

        if (issuesWithComments.length > 0) {
          const totalResponseTime = issuesWithComments.reduce(
            (sum, issue) => sum + issue.responseTimeHours,
            0
          );
          responseTimeMetrics = {
            averageResponseHours: Math.floor(totalResponseTime / issuesWithComments.length),
            sampleSize: issuesWithComments.length
          };
        }
      }
    }

    // --- Code Complexity (Very difficult to assess accurately via API) ---
    let codeComplexity = 'Difficult to assess via API.';
    if (repoInfo.size) {
      if (repoInfo.size < 500) {
        codeComplexity = 'Likely low complexity (based on size).';
      } else if (repoInfo.size < 5000) {
        codeComplexity = 'Potentially moderate complexity (based on size).';
      } else {
        codeComplexity = 'Likely high complexity (based on size).';
      }
    }

    // --- Calculate Risk Score ---
    let riskScore = 0;
    const riskFactors = [];

    // Sustainability Factors
    if (numberOfContributors < 2) {
      riskScore += 3;
      riskFactors.push('Low number of contributors.');
    } else if (numberOfContributors < 5) {
      riskScore += 1;
      riskFactors.push('Relatively low number of contributors.');
    }

    // Consider contributor maturity (GitHub account age)
    if (averageContributorAgeInDays !== null) {
      if (averageContributorAgeInDays < 180) {
        riskScore += 2;
        riskFactors.push('Contributors have relatively new GitHub accounts (< 6 months).');
      } else if (averageContributorAgeInDays < 365) {
        riskScore += 1;
        riskFactors.push('Contributors have moderately new GitHub accounts (< 1 year).');
      }
    }

    if (ageInDays < 365) {
      riskScore += 1;
      riskFactors.push('Relatively young project.');
    }

    if (daysSinceLastCommit === null || daysSinceLastCommit > 90) {
      riskScore += 2;
      riskFactors.push('Infrequent recent contributions.');
    } else if (daysSinceLastCommit > 30) {
      riskScore += 1;
      riskFactors.push('Potentially infrequent recent contributions.');
    }

    // License risk factor
    if (license === 'Unknown') {
      riskScore += 3;
      riskFactors.push('No license found.');
    } else if (licenseRisk === 'High') {
      riskScore += 2;
      riskFactors.push('Restrictive license may limit usage.');
    } else if (licenseRisk === 'Medium') {
      riskScore += 1;
      riskFactors.push('License has some usage restrictions.');
    }

    // Dependencies risk
    if (!hasDependencyFile) {
      riskScore += 1;
      riskFactors.push('No dependency management file found.');
    }

    // Test coverage risk
    if (!hasTestDirectory) {
      riskScore += 2;
      riskFactors.push('No test directory found.');
    }

    // CI/CD setup
    if (!hasCiSetup) {
      riskScore += 1;
      riskFactors.push('No CI/CD configuration found.');
    }

    // Documentation risk
    if (!hasReadme) {
      riskScore += 2;
      riskFactors.push('No README file found.');
    }

    if (!hasDocDirectory && !hasReadme) {
      riskScore += 1;
      riskFactors.push('Limited documentation.');
    }

    // Release practices
    if (!releaseInfo.hasReleases) {
      riskScore += 1;
      riskFactors.push('No formal releases found.');
    } else if (releaseInfo.daysSinceLastRelease > 365) {
      riskScore += 2;
      riskFactors.push('No releases in over a year.');
    } else if (!releaseInfo.usesSemanticVersioning) {
      riskScore += 1;
      riskFactors.push('Not using semantic versioning.');
    }

    // Community metrics
    if (starCount < 10) {
      riskScore += 1;
      riskFactors.push('Low community interest (few stars).');
    }

    // Response time metrics
    if (responseTimeMetrics && responseTimeMetrics.averageResponseHours > 168) {
      // More than 1 week
      riskScore += 2;
      riskFactors.push('Slow response time to issues (>1 week).');
    } else if (responseTimeMetrics && responseTimeMetrics.averageResponseHours > 72) {
      // More than 3 days
      riskScore += 1;
      riskFactors.push('Moderate response time to issues (>3 days).');
    }

    // Code quality tools
    if (!hasCodeQualityTools) {
      riskScore += 1;
      riskFactors.push('No code quality tools found.');
    }

    // Existing factors: contributing guidelines, PRs, issues, security policy, code complexity
    if (!hasContributingGuidelines) {
      riskScore += 1;
      riskFactors.push('No contributing guidelines found.');
    }

    if (longLivingPulls.length > 5) {
      riskScore += 2;
      riskFactors.push(`Many long-lived open pull requests (${longLivingPulls.length}).`);
    } else if (longLivingPulls.length > 0) {
      riskScore += 1;
      riskFactors.push(`Some long-lived open pull requests (${longLivingPulls.length}).`);
    }

    if (longLivingIssues.length > 10) {
      riskScore += 3;
      riskFactors.push(`Many long-lived open issues (${longLivingIssues.length}).`);
    } else if (longLivingIssues.length > 5) {
      riskScore += 2;
      riskFactors.push(`Several long-lived open issues (${longLivingIssues.length}).`);
    } else if (longLivingIssues.length > 0) {
      riskScore += 1;
      riskFactors.push(`Some long-lived open issues (${longLivingIssues.length}).`);
    }

    // Security Factors
    if (!hasSecurityPolicy) {
      riskScore += 2;
      riskFactors.push('No explicit security policy found.');
    }

    if (codeComplexity.startsWith('Likely high')) {
      riskScore += 1;
      riskFactors.push('Potentially high code complexity.');
    }

    // Add vulnerability scoring
    if (dependencyAnalysis.highSeverityCount > 0) {
      riskScore += 3;
      riskFactors.push(
        `${dependencyAnalysis.highSeverityCount} high severity vulnerabilities found.`
      );
    }

    if (dependencyAnalysis.mediumSeverityCount > 0) {
      riskScore += 2;
      riskFactors.push(
        `${dependencyAnalysis.mediumSeverityCount} medium severity vulnerabilities found.`
      );
    }

    if (dependencyAnalysis.lowSeverityCount > 0) {
      riskScore += 1;
      riskFactors.push(
        `${dependencyAnalysis.lowSeverityCount} low severity vulnerabilities found.`
      );
    }

    if (dependencyAnalysis.hasDependencies && !dependencyAnalysis.alertsEnabled) {
      riskScore += 1;
      riskFactors.push('Repository has dependencies but vulnerability alerts are not enabled.');
    }

    // Add outdated dependencies risk factors
    if (dependencyAnalysis.majorOutdatedCount > 5) {
      riskScore += 3;
      riskFactors.push(
        `Many dependencies are severely outdated (${dependencyAnalysis.majorOutdatedCount} major versions behind).`
      );
    } else if (dependencyAnalysis.majorOutdatedCount > 0) {
      riskScore += 2;
      riskFactors.push(
        `Some dependencies are severely outdated (${dependencyAnalysis.majorOutdatedCount} major versions behind).`
      );
    }

    if (dependencyAnalysis.minorOutdatedCount > 10) {
      riskScore += 1;
      riskFactors.push(
        `Many dependencies need minor version updates (${dependencyAnalysis.minorOutdatedCount} minor versions behind).`
      );
    }

    // Adjust risk rating scale for the new factors
    let riskRating = 'Low';
    if (riskScore > 15) {
      // Adjusted threshold
      riskRating = 'High';
    } else if (riskScore > 10) {
      // Adjusted threshold
      riskRating = 'Medium';
    }

    // --- Construct Markdown Summary ---
    const markdownSummary = `## GitHub Repository Analysis: ${owner}/${repo}

${
  readmeExcerpt
    ? `
### Project Description
${readmeExcerpt}

[View Full README](${readmeUrl})
`
    : ''
}

### Sustainability Assessment

| Metric | Value |
|--------|-------|
| Number of Contributors | ${numberOfContributors} |
| Avg. Contributor Account Age | ${
      averageContributorAgeInYears ? `${averageContributorAgeInYears} years` : 'N/A'
    } |
| Project Age | ${ageInDays} days (Created on ${createdAt.toLocaleDateString()}) |
| Recent Commits | ${numberOfCommits} commits found in the last 100 |
| Last Activity | ${
      daysSinceLastCommit !== null
        ? `${daysSinceLastCommit} days ago (${lastCommitDate.toLocaleDateString()})`
        : 'N/A'
    } |
| Contributing Guidelines | ${hasContributingGuidelines ? '✅ Present' : '❌ Missing'} |
| Long-Lived PRs (>90 days) | ${longLivingPulls.length} |
| Long-Lived Issues (>180 days) | ${longLivingIssues.length} |

### Security Assessment

| Metric | Value |
|--------|-------|
| Security Policy | ${hasSecurityPolicy ? '✅ Present' : '❌ Missing'} |
| Code Complexity | ${codeComplexity} |
| Last Update | ${updatedAt.toLocaleDateString()} |

### License Information

| Metric | Value |
|--------|-------|
| License | ${license} |
| License Risk | ${licenseRisk} |

### Dependency Analysis

| Metric | Value |
|--------|-------|
| Dependency Files | ${hasDependencyFile ? '✅ Found' : '❌ Not Found'} |
| Total Dependencies | ${
      dependencyAnalysis.dependenciesCount > 0 ? dependencyAnalysis.dependenciesCount : 'N/A'
    } |
| Major Version Outdated | ${
      dependencyAnalysis.majorOutdatedCount > 0
        ? `⚠️ ${dependencyAnalysis.majorOutdatedCount}`
        : dependencyAnalysis.parsedDependencies.length > 0
          ? '✅ 0'
          : 'N/A'
    } |
| Minor Version Outdated | ${
      dependencyAnalysis.minorOutdatedCount > 0
        ? `ℹ️ ${dependencyAnalysis.minorOutdatedCount}`
        : dependencyAnalysis.parsedDependencies.length > 0
          ? '✅ 0'
          : 'N/A'
    } |
| Vulnerability Alerts | ${
      dependencyAnalysis.alertsEnabled ? '✅ Enabled' : '❌ Disabled/Not Available'
    } |
| High Severity Vulnerabilities | ${
      dependencyAnalysis.highSeverityCount !== null ? dependencyAnalysis.highSeverityCount : 'N/A'
    } |
| Medium Severity Vulnerabilities | ${
      dependencyAnalysis.mediumSeverityCount !== null
        ? dependencyAnalysis.mediumSeverityCount
        : 'N/A'
    } |
| Low Severity Vulnerabilities | ${
      dependencyAnalysis.lowSeverityCount !== null ? dependencyAnalysis.lowSeverityCount : 'N/A'
    } |
| Vulnerability Source | ${dependencyAnalysis.vulnerabilitySource || 'N/A'} |

${
  dependencyAnalysis.vulnerablePackages.length > 0
    ? `
#### Vulnerable Dependencies

| Package | Severity | Fixed In | ID |
|---------|----------|---------|-----|
${dependencyAnalysis.vulnerablePackages
  .map(pkg => `| ${pkg.name} | ${pkg.severity} | ${pkg.fixedIn} | ${pkg.id || 'N/A'} |`)
  .join('\n')}

${dependencyAnalysis.vulnerablePackages
  .map(pkg => (pkg.details ? `**${pkg.name}**: ${pkg.details}` : ''))
  .filter(Boolean)
  .join('\n\n')}
`
    : ''
}

${
  dependencyAnalysis.outdatedDependencies.length > 0
    ? `
#### Outdated Dependencies

| Package | Current Version | Latest Version | Update Urgency |
|---------|----------------|---------------|---------------|
${dependencyAnalysis.outdatedDependencies
  .map(
    dep =>
      `| ${dep.name} | ${dep.currentVersion} | ${dep.latestVersion} | ${
        dep.updateUrgency === 'high'
          ? '🔴 High'
          : dep.updateUrgency === 'medium'
            ? '🟠 Medium'
            : '🟡 Low'
      } |`
  )
  .join('\n')}
`
    : ''
}

${
  dependencyAnalysis.parsedDependencies.length > 0
    ? `
#### Top Dependencies

| Package | Version |
|---------|---------|
${dependencyAnalysis.parsedDependencies.map(dep => `| ${dep.name} | ${dep.version} |`).join('\n')}
`
    : ''
}

### Development Quality

| Metric | Value |
|--------|-------|
| Dependency Management | ${hasDependencyFile ? '✅ Present' : '❌ Missing'} |
| Test Coverage | ${hasTestDirectory ? '✅ Tests Found' : '❌ No Tests Found'} |
| CI/CD Setup | ${hasCiSetup ? '✅ Present' : '❌ Missing'} |
| Code Quality Tools | ${hasCodeQualityTools ? '✅ Present' : '❌ Missing'} |
| Documentation | ${hasReadme ? (hasDocDirectory ? '✅ Extensive' : '✅ Basic') : '❌ Missing'} |

### Community Health

| Metric | Value |
|--------|-------|
| Stars | ${starCount} |
| Forks | ${forkCount} |
| Watchers | ${watcherCount} |
| Open Issues | ${openIssuesCount} |
| Average Response Time | ${
      responseTimeMetrics
        ? `${responseTimeMetrics.averageResponseHours} hours (Sample: ${responseTimeMetrics.sampleSize})`
        : 'N/A'
    } |

### Release Practices

| Metric | Value |
|--------|-------|
| Formal Releases | ${
      releaseInfo.hasReleases ? `✅ (${releaseInfo.releaseCount} found)` : '❌ None found'
    } |
| Latest Release | ${
      releaseInfo.latestReleaseDate
        ? `${
            releaseInfo.daysSinceLastRelease
          } days ago (${releaseInfo.latestReleaseDate.toLocaleDateString()})`
        : 'N/A'
    } |
| Semantic Versioning | ${releaseInfo.usesSemanticVersioning ? '✅ Used' : '❌ Not used'} |

### Risk Summary

**Risk Score:** ${riskScore} (${riskRating})

#### Risk Factors Identified
${
  riskFactors.length > 0
    ? riskFactors.map(factor => `- ${factor}`).join('\n')
    : 'None significant found based on available data.'
}

### Notes

- Code complexity assessment is based on repository size only
- Security assessment is limited by the public GitHub API
- Test coverage is based on directory presence, not actual coverage metrics
- Dependency vulnerability detection requires a GitHub token with appropriate permissions
- This analysis provides a snapshot and should not be considered a definitive security audit
`;

    return { markdownSummary, riskScore, riskRating };
  } catch (error) {
    console.error('An error occurred:', error);
    return {
      markdownSummary: `Error during analysis: ${error.message}`,
      riskScore: 'N/A'
    };
  }
}

// Helper function to determine severity from OSV vulnerability data
function determineSeverity(vulnerability) {
  // Try to extract CVSS score
  let cvssScore = null;

  // Check if severity is directly provided
  if (vulnerability.severity && vulnerability.severity.length > 0) {
    const severities = vulnerability.severity.map(s => s.type.toUpperCase());
    if (severities.includes('CRITICAL')) return 'CRITICAL';
    if (severities.includes('HIGH')) return 'HIGH';
    if (severities.includes('MEDIUM')) return 'MEDIUM';
    if (severities.includes('LOW')) return 'LOW';
  }

  // Try to extract from CVSS score if available
  if (vulnerability.database_specific && vulnerability.database_specific.cvss) {
    cvssScore = vulnerability.database_specific.cvss.score;
  } else if (vulnerability.database_specific && vulnerability.database_specific.severity) {
    // Use database-specific severity if available
    const sev = vulnerability.database_specific.severity.toUpperCase();
    if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(sev)) {
      return sev;
    }
  }

  // Determine severity based on CVSS score if available
  if (cvssScore !== null) {
    if (cvssScore >= 9.0) return 'CRITICAL';
    if (cvssScore >= 7.0) return 'HIGH';
    if (cvssScore >= 4.0) return 'MEDIUM';
    return 'LOW';
  }

  // Default to MEDIUM if we can't determine
  return 'MEDIUM';
}

// Helper function to extract fixed versions from OSV data
function extractFixedVersions(vulnerability) {
  if (!vulnerability.affected || !vulnerability.affected.length) return 'unknown';

  const fixedVersions = [];

  vulnerability.affected.forEach(affected => {
    if (affected.ranges) {
      affected.ranges.forEach(range => {
        if (range.type === 'SEMVER' && range.events) {
          range.events.forEach(event => {
            if (event.fixed) {
              fixedVersions.push(event.fixed);
            }
          });
        }
      });
    }
  });

  return fixedVersions.length > 0 ? fixedVersions.join(', ') : 'unknown';
}

module.exports = { analyzeGitHubRepository };
