import { promises as fs } from 'fs';
import { analyzeGitHubRepository } from './analyzer';

interface AnalysisResult {
  markdownSummary: string;
  riskScore: number | string;
  riskRating?: string;
}

export async function main(): Promise<void> {
  console.log('Git-Assure - Repository Analysis Tool');
  console.log('-----------------------------------');
  console.log('This tool analyzes GitHub repositories for sustainability and security risks.');
  console.log('It provides a risk score and detailed markdown summary based on various factors.');
  console.log('-----------------------------------');

  // Get command line arguments
  const args: string[] = process.argv.slice(2);
  let repoUrl: string = '';
  let outputFile: string = '';

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      if (i + 1 < args.length) {
        outputFile = args[i + 1];
        i++; // Skip the next argument as we've processed it
      }
    } else if (!repoUrl) {
      repoUrl = args[i]; // The first non-option argument is the repository
    }
  }

  // Validate input
  if (!repoUrl) {
    console.error('Error: Please provide a GitHub repository URL or owner/repo.');
    console.error('Usage: git-assure <repository-url|owner/repo> [--output <file-path>]');
    throw new Error('Invalid input: Please provide a GitHub repository URL or owner/repo.');
  }

  // Determine if the input is a full URL or just owner/repo
  if (!repoUrl.includes('github.com')) {
    repoUrl = `https://github.com/${repoUrl}`;
  }

  try {
    console.log(`Analyzing repository: ${repoUrl}`);
    const analysisResult: AnalysisResult = await analyzeGitHubRepository(repoUrl);

    // Output to file if specified
    if (outputFile) {
      await fs.writeFile(outputFile, analysisResult.markdownSummary);
      console.log(`Analysis written to ${outputFile}`);
    } else {
      // Output to console
      console.log(analysisResult.markdownSummary);
    }

    console.log(`Overall Risk Score: ${analysisResult.riskScore} (${analysisResult.riskRating})`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error during analysis: ${errorMessage}`);
    throw new Error(`Analysis failed: ${errorMessage}`);
  }
}

// Run the CLI tool if called directly
if (require.main === module) {
  main();
}
