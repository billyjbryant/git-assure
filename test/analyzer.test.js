const nock = require('nock');
const { analyzeGitHubRepository } = require('../src/analyzer');

// Disable actual HTTP requests during testing
beforeAll(() => {
  nock.disableNetConnect();
});

afterAll(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

afterEach(() => {
  nock.cleanAll();
});

// Helper function to mock all common API calls with 404 responses (resources not found)
function mockCommonApiEndpoints() {
  // Mock tests directory checks
  ['tests', 'test', '__tests__', 'spec'].forEach(dir => {
    nock('https://api.github.com').get(`/repos/owner/repo/contents/${dir}`).reply(404);
  });

  // Mock CI/CD setup checks
  [
    '.github/workflows',
    '.travis.yml',
    '.gitlab-ci.yml',
    'azure-pipelines.yml',
    'Jenkinsfile',
    '.circleci/config.yml'
  ].forEach(path => {
    nock('https://api.github.com').get(`/repos/owner/repo/contents/${path}`).reply(404);
  });

  // Mock documentation directories
  ['docs', 'documentation', 'wiki'].forEach(dir => {
    nock('https://api.github.com').get(`/repos/owner/repo/contents/${dir}`).reply(404);
  });

  // Mock code quality tools
  [
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.json',
    '.prettierrc',
    '.prettierrc.js',
    '.prettierrc.json',
    '.stylelintrc',
    '.pylintrc',
    'tslint.json',
    '.rubocop.yml'
  ].forEach(file => {
    nock('https://api.github.com').get(`/repos/owner/repo/contents/${file}`).reply(404);
  });

  // Mock dependency files
  ['package-lock.json', 'requirements.txt', 'Gemfile', 'build.gradle', 'pom.xml'].forEach(file => {
    nock('https://api.github.com').get(`/repos/owner/repo/contents/${file}`).reply(404);
  });

  // Mock contributing guidelines and security policies
  nock('https://api.github.com').get('/repos/owner/repo/contents/CONTRIBUTING.md').reply(404);
  nock('https://api.github.com').get('/repos/owner/repo/contents/SECURITY.md').reply(404);
  nock('https://api.github.com').get('/repos/owner/repo/contents/SECURITY.txt').reply(404);

  // Mock vulnerability alerts endpoint
  nock('https://api.github.com').get('/repos/owner/repo/vulnerability-alerts').reply(404);
}

describe('analyzeGitHubRepository', () => {
  test('should return error for invalid GitHub URLs', async () => {
    // Test invalid URL format
    const result = await analyzeGitHubRepository('not-a-github-url');
    expect(result.riskScore).toBe('N/A');
    expect(result.markdownSummary).toContain('Error: Invalid GitHub repository URL.');
  });

  test('should return error when API request fails', async () => {
    // Mock failed API response
    nock('https://api.github.com').get('/repos/owner/repo').reply(404, { message: 'Not Found' });

    const result = await analyzeGitHubRepository('https://github.com/owner/repo');
    expect(result.riskScore).toBe('N/A');
    expect(result.markdownSummary).toContain('Error fetching repository');
  });

  test('should correctly analyze repository with minimal data', async () => {
    // Mock basic repository data with minimal information
    const mockDate = new Date('2023-01-01').toISOString();

    nock('https://api.github.com')
      .get('/repos/owner/repo')
      .reply(200, {
        name: 'repo',
        owner: { login: 'owner' },
        created_at: mockDate,
        updated_at: mockDate,
        stargazers_count: 5,
        forks_count: 2,
        subscribers_count: 3,
        open_issues_count: 1,
        size: 100,
        license: null
      });

    // Mock empty contributors
    nock('https://api.github.com').get('/repos/owner/repo/contributors').reply(200, []);

    // Mock missing README
    nock('https://api.github.com').get('/repos/owner/repo/contents/README.md').reply(404);

    // Mock all common API endpoints
    mockCommonApiEndpoints();

    // Mock package.json as not found
    nock('https://api.github.com').get('/repos/owner/repo/contents/package.json').reply(404);

    // Mock releases
    nock('https://api.github.com').get('/repos/owner/repo/releases').reply(200, []);

    // Mock commits
    nock('https://api.github.com')
      .get('/repos/owner/repo/commits?per_page=100')
      .reply(200, [
        {
          commit: { author: { date: mockDate } }
        }
      ]);

    // Mock PRs and issues
    nock('https://api.github.com').get('/repos/owner/repo/pulls?state=open').reply(200, []);
    nock('https://api.github.com')
      .get('/repos/owner/repo/issues?state=open&sort=created&direction=asc')
      .reply(200, []);

    const result = await analyzeGitHubRepository('https://github.com/owner/repo');

    // Check key analyzer outputs
    expect(result.riskScore).toBeGreaterThan(0); // Should have some risk factors
    expect(result.riskRating).toMatch(/^(Low|Medium|High)$/);
    expect(result.markdownSummary).toContain('GitHub Repository Analysis: owner/repo');

    // Verify risk factors are identified
    expect(result.markdownSummary).toContain('Risk Score');
  });

  test('should correctly analyze repository with MIT license', async () => {
    // Setup test environment
    const mockDate = new Date('2023-01-01').toISOString();

    // Mock basic repository info with MIT license
    nock('https://api.github.com')
      .get('/repos/owner/repo')
      .reply(200, {
        name: 'repo',
        owner: { login: 'owner' },
        created_at: mockDate,
        updated_at: mockDate,
        stargazers_count: 5,
        forks_count: 2,
        subscribers_count: 3,
        open_issues_count: 1,
        size: 100,
        license: { key: 'mit', name: 'MIT License' }
      });

    // Mock contributors
    nock('https://api.github.com')
      .get('/repos/owner/repo/contributors')
      .reply(200, [{ login: 'user1', url: 'https://api.github.com/users/user1' }]);

    // Mock user data
    nock('https://api.github.com')
      .get('/users/user1')
      .reply(200, { created_at: '2020-01-01T00:00:00Z' });

    // Mock all common API endpoints
    mockCommonApiEndpoints();

    // Mock package.json with content
    nock('https://api.github.com')
      .get('/repos/owner/repo/contents/package.json')
      .reply(200, {
        content: Buffer.from(
          JSON.stringify({
            dependencies: {
              express: '^4.17.1'
            }
          })
        ).toString('base64'),
        size: 100
      });

    // Mock releases
    nock('https://api.github.com').get('/repos/owner/repo/releases').reply(200, []);

    // Mock commits
    nock('https://api.github.com')
      .get('/repos/owner/repo/commits?per_page=100')
      .reply(200, [
        {
          commit: { author: { date: mockDate } }
        }
      ]);

    // Mock README file present
    nock('https://api.github.com')
      .get('/repos/owner/repo/contents/README.md')
      .reply(200, {
        content: Buffer.from('# Test Repo\n\nThis is a test repository.').toString('base64'),
        html_url: 'https://github.com/owner/repo/blob/main/README.md',
        size: 50
      });

    // Mock PRs and issues
    nock('https://api.github.com').get('/repos/owner/repo/pulls?state=open').reply(200, []);
    nock('https://api.github.com')
      .get('/repos/owner/repo/issues?state=open&sort=created&direction=asc')
      .reply(200, []);
    nock('https://api.github.com')
      .get('/repos/owner/repo/issues?state=closed&sort=updated&direction=desc&per_page=30')
      .reply(200, []);

    const result = await analyzeGitHubRepository('https://github.com/owner/repo');

    // Check license detection
    expect(result.markdownSummary).toContain('MIT License');
    expect(result.markdownSummary).toContain('Low'); // MIT should have low license risk
  });
});
