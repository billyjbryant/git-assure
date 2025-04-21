"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const fs_1 = require("fs");
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const analyzer_1 = require("./analyzer");
// Main function for GitHub Actions
async function run() {
    try {
        // Get inputs from the workflow
        const repository = core.getInput('repository');
        const outputFile = core.getInput('output-file');
        const commentOnPr = core.getBooleanInput('comment-on-pr');
        const commentMode = core.getInput('comment-mode');
        // Determine the repository URL
        let repoUrl;
        if (repository.includes('github.com')) {
            // It's already a full URL
            repoUrl = repository;
        }
        else if (repository.includes('/')) {
            // It's in the format owner/repo
            repoUrl = `https://github.com/${repository}`;
        }
        else {
            // Use the current repository
            const context = github.context;
            repoUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}`;
        }
        // Set token from environment (using GITHUB_TOKEN) for API access
        const token = core.getInput('token');
        if (token) {
            process.env.GH_TOKEN = token;
            core.debug('Using provided GitHub token for authentication');
        }
        else {
            core.debug('No token provided, using unauthenticated requests (rate limits apply)');
        }
        // Run the analysis
        core.debug(`Analyzing repository: ${repoUrl}`);
        const analysisResult = await (0, analyzer_1.analyzeGitHubRepository)(repoUrl);
        // Ensure riskRating is always defined
        if (!analysisResult.riskRating) {
            analysisResult.riskRating = 'N/A';
        }
        // Set outputs for GitHub Actions
        core.setOutput('risk-score', analysisResult.riskScore);
        core.setOutput('risk-rating', analysisResult.riskRating);
        core.setOutput('summary', analysisResult.markdownSummary);
        // Save to file if requested
        if (outputFile) {
            await fs_1.promises.writeFile(outputFile, analysisResult.markdownSummary);
            core.info(`Analysis written to ${outputFile}`);
        }
        // Log results
        core.info(`Analysis complete. Risk Score: ${analysisResult.riskScore} (${analysisResult.riskRating})`);
        // For detailed results in the logs
        core.debug('Analysis Details:');
        core.debug(analysisResult.markdownSummary);
        // Comment on PR if requested and in a PR context
        if (commentOnPr && token && github.context.payload.pull_request) {
            // Ensure riskRating is defined before passing to the function
            const safeAnalysisResult = {
                ...analysisResult,
                riskRating: analysisResult.riskRating || 'N/A'
            };
            await commentOnPullRequest(token, safeAnalysisResult, commentMode);
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        core.setFailed(`Analysis failed: ${errorMessage}`);
    }
}
/**
 * Posts the analysis results as a comment on the current pull request
 *
 * @param token - GitHub token
 * @param analysisResult - The result of the repository analysis
 * @param commentMode - How to post comments: 'create-new' or 'update-existing'
 */
async function commentOnPullRequest(token, analysisResult, commentMode) {
    try {
        const octokit = github.getOctokit(token);
        const context = github.context;
        const { owner, repo } = context.repo;
        const pull_number = context.payload.pull_request?.number;
        if (!pull_number) {
            core.warning('Could not determine pull request number.');
            return;
        }
        core.info(`Commenting on PR #${pull_number}`);
        // Create a comment header that uniquely identifies our comment for later updates
        const commentHeader = '## Git-Assure Report';
        const commentTag = '<!-- git-assure-comment -->';
        // Prepare the comment content
        const commentBody = `${commentTag}
${commentHeader}

Repository analyzed on: ${new Date().toISOString().split('T')[0]}

### Risk Rating: ${analysisResult.riskRating} (Score: ${analysisResult.riskScore})

${analysisResult.markdownSummary}

---
*This analysis was performed automatically by [Git-Assure](https://github.com/billyjbryant/git-assure)*`;
        if (commentMode === 'update-existing') {
            // Try to find and update an existing comment
            const { data: comments } = await octokit.rest.issues.listComments({
                owner,
                repo,
                issue_number: pull_number
            });
            // Look for our previous comment by checking for the tag
            const existingComment = comments.find(comment => (comment.body ?? '').includes(commentTag));
            if (existingComment) {
                // Update the existing comment
                await octokit.rest.issues.updateComment({
                    owner,
                    repo,
                    comment_id: existingComment.id,
                    body: commentBody
                });
                core.info('Updated existing analysis comment on PR');
                return;
            }
        }
        // Either we're in create-new mode or no existing comment was found
        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pull_number,
            body: commentBody
        });
        core.info('Created new analysis comment on PR');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        core.warning(`Failed to comment on PR: ${errorMessage}`);
    }
}
run();
