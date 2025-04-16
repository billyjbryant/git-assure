// Mock modules before importing
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  getBooleanInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'testOwner',
      repo: 'testRepo'
    },
    payload: {
      pull_request: { number: 123 }
    }
  },
  getOctokit: jest.fn()
}));

jest.mock('../src/analyzer');
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue(undefined)
  },
  constants: {
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
    S_IFMT: 61440,
    S_IFREG: 32768
  }
}));

// Now import after mocking is complete
import * as core from '@actions/core';
import * as github from '@actions/github';
import { promises as fs } from 'fs';
import { analyzeGitHubRepository } from '../src/analyzer';
import { run } from '../src/action';

describe('GitHub Action', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should analyze repository and post results', async () => {
    // Setup mocks
    const mockOctokit = {
      rest: {
        issues: {
          listComments: jest.fn().mockResolvedValue({
            data: []
          }),
          createComment: jest.fn().mockResolvedValue({ data: { id: 123 } })
        }
      }
    };

    (github.getOctokit as jest.Mock).mockReturnValue(mockOctokit);
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'token') return 'fake-token';
      if (name === 'repository') return 'owner/repo';
      if (name === 'output-file') return 'report.md';
      if (name === 'comment-mode') return 'create-new';
      return '';
    });

    (core.getBooleanInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'comment-on-pr') return true;
      return false;
    });

    (analyzeGitHubRepository as jest.Mock).mockResolvedValue({
      markdownSummary: '## Repository Analysis',
      riskScore: 75,
      riskRating: 'Medium'
    });

    // Run the action
    await run();

    // Assert mocks were called correctly
    expect(core.getInput).toHaveBeenCalledWith('token');
    expect(github.getOctokit).toHaveBeenCalledWith('fake-token');
    expect(analyzeGitHubRepository).toHaveBeenCalledWith('https://github.com/owner/repo');
    expect(core.setOutput).toHaveBeenCalledWith('risk-score', 75);
    expect(core.setOutput).toHaveBeenCalledWith('risk-rating', 'Medium');
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith('report.md', '## Repository Analysis');
  });

  test('should handle analysis errors', async () => {
    // Setup mocks
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      if (name === 'token') return 'fake-token';
      return '';
    });

    (analyzeGitHubRepository as jest.Mock).mockRejectedValue(new Error('Analysis error'));

    // Run the action
    await run();

    // Assert error handling
    expect(core.setFailed).toHaveBeenCalledWith('Analysis failed: Analysis error');
  });
});
