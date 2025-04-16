const { main } = require('../src/cli');
const { analyzeGitHubRepository } = require('../src/analyzer');

// Mock the analyzer module
jest.mock('../src/analyzer');

// Mock console methods for testing output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

describe('CLI Tool', () => {
  let consoleOutput = [];
  let consoleErrors = [];

  beforeEach(() => {
    // Reset mocks and captured output for each test
    jest.clearAllMocks();
    consoleOutput = [];
    consoleErrors = [];

    // Mock console.log to capture output
    console.log = jest.fn((...args) => {
      consoleOutput.push(args.join(' '));
    });

    // Mock console.error to capture errors
    console.error = jest.fn((...args) => {
      consoleErrors.push(args.join(' '));
    });

    // Mock process.argv
    process.argv = ['node', 'cli.js'];
  });

  afterAll(() => {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    mockExit.mockRestore();
  });

  test('should show error when no repository is provided', async () => {
    // Call main with empty args
    await main();

    // Check error message
    expect(consoleErrors).toContain('Error: Please provide a GitHub repository URL or owner/repo.');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  test('should convert owner/repo format to full GitHub URL', async () => {
    // Setup analyzeGitHubRepository mock
    const mockResult = {
      markdownSummary: 'Test Summary',
      riskScore: 5,
      riskRating: 'Low'
    };
    analyzeGitHubRepository.mockResolvedValue(mockResult);

    // Set CLI args to use short format
    process.argv = ['node', 'cli.js', 'owner/repo'];

    // Call main
    await main();

    // Check if the URL was properly constructed
    expect(analyzeGitHubRepository).toHaveBeenCalledWith('https://github.com/owner/repo');

    // Check output
    expect(consoleOutput).toContain('Test Summary');
    expect(consoleOutput).toContain('Overall Risk Score: 5 (Low)');
  });

  test('should handle output file option', async () => {
    // Mock fs.promises.writeFile
    const fs = require('fs').promises;
    const writeFileMock = jest.spyOn(fs, 'writeFile').mockResolvedValue();

    // Setup analyzeGitHubRepository mock
    const mockResult = {
      markdownSummary: 'Test Summary to File',
      riskScore: 7,
      riskRating: 'Medium'
    };
    analyzeGitHubRepository.mockResolvedValue(mockResult);

    // Set CLI args with output option
    process.argv = ['node', 'cli.js', 'https://github.com/owner/repo', '--output', 'output.md'];

    // Call main
    await main();

    // Check if file was written
    expect(writeFileMock).toHaveBeenCalledWith('output.md', 'Test Summary to File');
    expect(consoleOutput).toContain('Analysis written to output.md');

    // Cleanup
    writeFileMock.mockRestore();
  });

  test('should handle short output option (-o)', async () => {
    // Mock fs.promises.writeFile
    const fs = require('fs').promises;
    const writeFileMock = jest.spyOn(fs, 'writeFile').mockResolvedValue();

    // Setup analyzeGitHubRepository mock
    const mockResult = {
      markdownSummary: 'Test Summary to File',
      riskScore: 7,
      riskRating: 'Medium'
    };
    analyzeGitHubRepository.mockResolvedValue(mockResult);

    // Set CLI args with short output option
    process.argv = ['node', 'cli.js', 'owner/repo', '-o', 'output.md'];

    // Call main
    await main();

    // Check if file was written
    expect(writeFileMock).toHaveBeenCalledWith('output.md', 'Test Summary to File');
    expect(consoleOutput).toContain('Analysis written to output.md');

    // Cleanup
    writeFileMock.mockRestore();
  });

  test('should handle analyzer errors', async () => {
    // Setup analyzeGitHubRepository mock to reject
    analyzeGitHubRepository.mockRejectedValue(new Error('Test error'));

    // Set CLI args
    process.argv = ['node', 'cli.js', 'owner/repo'];

    // Call main
    await main();

    // Check error handling
    expect(consoleErrors).toContain('Error during analysis: Test error');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
