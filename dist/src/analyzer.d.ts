/**
 * Risk rating interface
 */
interface AnalysisResult {
    markdownSummary: string;
    riskScore: number | string;
    riskRating?: 'N/A' | 'Low' | 'Medium' | 'High';
}
/**
 * Function to Analyze a GitHub Repository
 *
 * @param {string} repoUrl - The URL of the GitHub repository to analyze.
 * @returns {Promise<AnalysisResult>} - A promise that resolves to an object containing the analysis results.
 */
export declare function analyzeGitHubRepository(repoUrl: string): Promise<AnalysisResult>;
export {};
