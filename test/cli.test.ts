// Mock dependencies first before any imports
jest.mock('../src/analyzer');
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue(undefined)
  }
}));

// Now import after mocking
import { main } from '../src/cli';
import { analyzeGitHubRepository } from '../src/analyzer';
import { promises as fs } from 'fs';

// Mock console methods for testing output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

describe('CLI Tool', () => {
  let consoleLogMock: jest.SpyInstance;
  let consoleErrorMock: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    consoleLogMock = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorMock = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.argv = ['node', 'cli.js']; // Reset argv for each test
  });

  afterEach(() => {
    consoleLogMock.mockRestore();
    consoleErrorMock.mockRestore();
  });

  afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    mockExit.mockRestore();
  });

  test('should analyze repository and output results', async () => {
    // Setup
    process.argv = ['node', 'cli.js', 'owner/repo'];
    (analyzeGitHubRepository as jest.Mock).mockResolvedValue({
      markdownSummary: '## Repository Analysis',
      riskScore: 75,
      riskRating: 'Medium'
    });

    // Execute
    await main();

    // Verify
    expect(analyzeGitHubRepository).toHaveBeenCalledWith('https://github.com/owner/repo');
    // Check for the welcome message and actual content (partial match is fine)
    expect(consoleLogMock).toHaveBeenCalledWith('Git-Assure - Repository Analysis Tool');
    expect(consoleLogMock).toHaveBeenCalledWith(
      'Analyzing repository: https://github.com/owner/repo'
    );
    expect(consoleLogMock).toHaveBeenCalledWith('## Repository Analysis');
    expect(consoleLogMock).toHaveBeenCalledWith('Overall Risk Score: 75 (Medium)');
  });

  test('should show error when no repository is provided', async () => {
    // Setup
    process.argv = ['node', 'cli.js'];

    // Execute & Verify
    await expect(main()).rejects.toThrow(
      'Invalid input: Please provide a GitHub repository URL or owner/repo.'
    );
    expect(consoleErrorMock).toHaveBeenCalledWith(
      'Error: Please provide a GitHub repository URL or owner/repo.'
    );
    expect(consoleErrorMock).toHaveBeenCalledWith(
      'Usage: git-assure <repository-url|owner/repo> [--output <file-path>]'
    );
  });

  test('should save output to file when --output flag is used', async () => {
    // Setup
    process.argv = ['node', 'cli.js', 'owner/repo', '--output', 'report.md'];
    (analyzeGitHubRepository as jest.Mock).mockResolvedValue({
      markdownSummary: '## Repository Analysis',
      riskScore: 75,
      riskRating: 'Medium'
    });

    // Execute
    await main();

    // Verify
    expect(fs.writeFile).toHaveBeenCalledWith('report.md', '## Repository Analysis');
    expect(consoleLogMock).toHaveBeenCalledWith('Analysis written to report.md');
  });

  test('should handle analyzer errors', async () => {
    // Setup
    process.argv = ['node', 'cli.js', 'owner/repo'];
    const testError = new Error('Test error');
    (analyzeGitHubRepository as jest.Mock).mockRejectedValue(testError);

    // Execute & Verify
    await expect(main()).rejects.toThrow('Analysis failed: Test error');
    expect(consoleErrorMock).toHaveBeenCalledWith('Error during analysis: Test error');
  });
});
