const fs = require('fs').promises;
const core = require('@actions/core');
const github = require('@actions/github');
const { analyzeGitHubRepository } = require('./analyzer');

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
    } else if (repository.includes('/')) {
      // It's in the format owner/repo
      repoUrl = `https://github.com/${repository}`;
    } else {
      // Use the current repository
      const context = github.context;
      repoUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}`;
    }

    // Set token from environment (using GITHUB_TOKEN) for API access
    const token = core.getInput('token');
    if (token) {
      process.env.GH_TOKEN = token;
      core.debug('Using provided GitHub token for authentication');
    } else {
      core.debug('No token provided, using unauthenticated requests (rate limits apply)');
    }

    // Run the analysis
    core.debug(`Analyzing repository: ${repoUrl}`);
    const analysisResult = await analyzeGitHubRepository(repoUrl);

    // Set outputs for GitHub Actions
    core.setOutput('risk-score', analysisResult.riskScore);
    core.setOutput('risk-rating', analysisResult.riskRating);
    core.setOutput('summary', analysisResult.markdownSummary);

    // Save to file if requested
    if (outputFile) {
      await fs.writeFile(outputFile, analysisResult.markdownSummary);
      core.info(`Analysis written to ${outputFile}`);
    }

    // Log results
    core.info(
      `Analysis complete. Risk Score: ${analysisResult.riskScore} (${analysisResult.riskRating})`
    );

    // For detailed results in the logs
    core.debug('Analysis Details:');
    core.debug(analysisResult.markdownSummary);

    // Comment on PR if requested and in a PR context
    if (commentOnPr && token && github.context.payload.pull_request) {
      await commentOnPullRequest(token, analysisResult, commentMode);
    }
  } catch (error) {
    core.setFailed(`Analysis failed: ${error.message}`);
  }
}

/**
 * Posts the analysis results as a comment on the current pull request
 *
 * @param {string} token - GitHub token
 * @param {Object} analysisResult - The result of the repository analysis
 * @param {string} commentMode - How to post comments: 'create-new' or 'update-existing'
 */
async function commentOnPullRequest(token, analysisResult, commentMode) {
  try {
    const octokit = github.getOctokit(token);
    const context = github.context;
    const { owner, repo } = context.repo;
    const pull_number = context.payload.pull_request.number;

    core.info(`Commenting on PR #${pull_number}`);

    // Create a comment header that uniquely identifies our comment for later updates
    const commentHeader = '## GitHub Repository Analyzer Report';
    const commentTag = '<!-- github-repo-analyzer-comment -->';

    // Prepare the comment content
    const commentBody = `${commentTag}
${commentHeader}

Repository analyzed on: ${new Date().toISOString().split('T')[0]}

### Risk Rating: ${analysisResult.riskRating} (Score: ${analysisResult.riskScore})

${analysisResult.markdownSummary}

---
*This analysis was performed automatically by [GitHub Repository Analyzer](https://github.com/billyjbryant/github-repo-analyzer)*`;

    if (commentMode === 'update-existing') {
      // Try to find and update an existing comment
      const { data: comments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: pull_number
      });

      // Look for our previous comment by checking for the tag
      const existingComment = comments.find(comment => comment.body.includes(commentTag));

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
  } catch (error) {
    core.warning(`Failed to comment on PR: ${error.message}`);
  }
}

run();
