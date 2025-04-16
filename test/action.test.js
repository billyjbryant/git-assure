const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs').promises;
const { analyzeGitHubRepository } = require('../src/analyzer');

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('../src/analyzer');
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue()
  }
}));

// Import the module under test - need to do this after setting up mocks
const runModule = require('../src/action');

describe('GitHub Action', () => {
  // Store original environment and mock data
  const originalEnv = process.env;
  const mockOctokit = {
    rest: {
      issues: {
        listComments: jest.fn(),
        createComment: jest.fn(),
        updateComment: jest.fn()
      }
    }
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Reset environment
    process.env = { ...originalEnv };

    // Setup default mocks
    github.context = {
      repo: {
        owner: 'testowner',
        repo: 'testrepo'
      }
    };

    github.getOctokit.mockReturnValue(mockOctokit);

    analyzeGitHubRepository.mockResolvedValue({
      markdownSummary: 'Test Summary',
      riskScore: 8,
      riskRating: 'Medium'
    });
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  test('should use provided repository URL', async () => {
    // Setup inputs
    core.getInput.mockImplementation(name => {
      switch (name) {
        case 'repository':
          return 'https://github.com/custom/repo';
        default:
          return '';
      }
    });

    // Run the action
    await runModule;

    // Check it used the provided URL
    expect(analyzeGitHubRepository).toHaveBeenCalledWith('https://github.com/custom/repo');
  });

  test('should convert owner/repo format to URL', async () => {
    // Setup inputs
    core.getInput.mockImplementation(name => {
      switch (name) {
        case 'repository':
          return 'custom/repo';
        default:
          return '';
      }
    });

    // Run the action
    await runModule;

    // Check it converted the format correctly
    expect(analyzeGitHubRepository).toHaveBeenCalledWith('https://github.com/custom/repo');
  });

  test('should use current repository when no repo specified', async () => {
    // Setup inputs (empty repository input)
    core.getInput.mockImplementation(() => '');

    // Run the action
    await runModule;

    // Should use the context repository
    expect(analyzeGitHubRepository).toHaveBeenCalledWith('https://github.com/testowner/testrepo');
  });

  test('should set outputs correctly', async () => {
    // Setup inputs
    core.getInput.mockImplementation(() => '');

    // Run the action
    await runModule;

    // Check outputs were set correctly
    expect(core.setOutput).toHaveBeenCalledWith('risk-score', 8);
    expect(core.setOutput).toHaveBeenCalledWith('risk-rating', 'Medium');
    expect(core.setOutput).toHaveBeenCalledWith('summary', 'Test Summary');
  });

  test('should save to output file if specified', async () => {
    // Setup inputs
    core.getInput.mockImplementation(name => {
      switch (name) {
        case 'output-file':
          return 'analysis.md';
        default:
          return '';
      }
    });

    // Run the action
    await runModule;

    // Check file was written
    expect(fs.writeFile).toHaveBeenCalledWith('analysis.md', 'Test Summary');
    expect(core.info).toHaveBeenCalledWith('Analysis written to analysis.md');
  });

  test('should use provided token for authentication', async () => {
    // Setup inputs
    core.getInput.mockImplementation(name => {
      switch (name) {
        case 'token':
          return 'test-token';
        default:
          return '';
      }
    });

    // Run the action
    await runModule;

    // Check token was set in environment
    expect(process.env.GH_TOKEN).toBe('test-token');
  });

  test('should handle errors properly', async () => {
    // Setup analyzer to throw error
    analyzeGitHubRepository.mockRejectedValue(new Error('Test error'));

    // Run the action
    await runModule;

    // Check error was reported
    expect(core.setFailed).toHaveBeenCalledWith('Analysis failed: Test error');
  });

  test('should comment on PR when requested and PR context exists', async () => {
    // Setup inputs
    core.getInput.mockImplementation(name => {
      switch (name) {
        case 'token':
          return 'test-token';
        case 'comment-on-pr':
          return 'true';
        case 'comment-mode':
          return 'create-new';
        default:
          return '';
      }
    });
    core.getBooleanInput.mockReturnValue(true);

    // Mock PR context
    github.context.payload = {
      pull_request: {
        number: 42
      }
    };

    // Run the action
    await runModule;

    // Check PR comment was created
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'testowner',
      repo: 'testrepo',
      issue_number: 42,
      body: expect.stringContaining('GitHub Repository Analyzer Report')
    });
    expect(core.info).toHaveBeenCalledWith('Created new analysis comment on PR');
  });

  test('should update existing comment when in update-existing mode', async () => {
    // Setup inputs
    core.getInput.mockImplementation(name => {
      switch (name) {
        case 'token':
          return 'test-token';
        case 'comment-on-pr':
          return 'true';
        case 'comment-mode':
          return 'update-existing';
        default:
          return '';
      }
    });
    core.getBooleanInput.mockReturnValue(true);

    // Mock PR context
    github.context.payload = {
      pull_request: {
        number: 42
      }
    };

    // Mock finding an existing comment
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: [
        {
          id: 123,
          body: 'Some other comment'
        },
        {
          id: 456,
          body: '<!-- github-repo-analyzer-comment -->\n## GitHub Repository Analyzer Report\n\nOld content'
        }
      ]
    });

    // Run the action
    await runModule;

    // Check comment was updated not created
    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: 'testowner',
      repo: 'testrepo',
      comment_id: 456,
      body: expect.stringContaining('GitHub Repository Analyzer Report')
    });
    expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith('Updated existing analysis comment on PR');
  });
});
