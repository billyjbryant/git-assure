# GitAssure

[![GitHub Release](https://img.shields.io/github/v/release/billyjbryant/git-assure?display_name=tag&style=for-the-badge)](https://github.com/billyjbryant/git-assure/releases)
[![npm version](https://img.shields.io/npm/v/git-assure?style=for-the-badge&color=red)](https://www.npmjs.com/package/git-assure)
[![GitHub Release Date](https://img.shields.io/github/release-date/billyjbryant/git-assure?display_date=published_at&style=for-the-badge)](https://github.com/billyjbryant/git-assure/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/billyjbryant/git-assure/release.yml?branch=main&style=for-the-badge)](https://github.com/billyjbryant/git-assure/actions/workflows/release.yml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg?style=for-the-badge)](https://github.com/semantic-release/semantic-release)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=for-the-badge)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green?style=for-the-badge)](https://nodejs.org/)

A comprehensive analysis tool for evaluating GitHub repositories. Git-Assure assesses sustainability and security risks, generating detailed reports to help you make informed decisions about the repositories you depend on.

## Table of Contents

- [GitAssure](#gitassure)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
    - [As an npm Package](#as-an-npm-package)
    - [As a Command Line Tool](#as-a-command-line-tool)
  - [Usage](#usage)
    - [In Node.js](#in-nodejs)
    - [Command Line Tool](#command-line-tool)
    - [GitHub Action](#github-action)
      - [PR Commenting](#pr-commenting)
  - [Output](#output)
  - [Contributing](#contributing)
  - [License](#license)

## Installation

### As an npm Package

Install the package from npm:

```bash
npm install git-assure
# or
yarn add git-assure
```

### As a Command Line Tool

You can install the CLI globally via npm:

```bash
npm install -g git-assure
git-assure owner/repo
```

Or use it directly via npx:

```bash
npx git-assure owner/repo
```

## Usage

### In Node.js

You can use the analyzer in your JavaScript or TypeScript projects:

```javascript
const { analyzeGitHubRepository } = require('git-assure');
// or ES modules
// import { analyzeGitHubRepository } from 'git-assure';

async function runAnalysis() {
  try {
    const repoUrl = 'https://github.com/owner/repo';
    const result = await analyzeGitHubRepository(repoUrl);

    console.log(`Risk Score: ${result.riskScore} (${result.riskRating})`);
    console.log(result.markdownSummary);

    // You can use the analysis results for your own purposes
    if (result.riskScore > 10) {
      console.log('High risk repository detected!');
    }
  } catch (error) {
    console.error('Analysis failed:', error);
  }
}

runAnalysis();
```

### Command Line Tool

You can run the analyzer using one of the following methods:

```bash
# If installed globally or in PATH
git-assure owner/repo

# If using npx
npx git-assure owner/repo

# With full URL
git-assure https://github.com/owner/repo

# Save output to a file
git-assure owner/repo --output analysis-report.md
```

### GitHub Action

You can use this tool as a GitHub Action in your workflows:

```yaml
name: Analyze Repository

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1' # Run weekly on Mondays

jobs:
  analyze:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Analyze Repository
        id: analysis
        uses: billyjbryant/git-assure@v0
        with:
          # The repository to analyze (defaults to the current repository)
          repository: ${{ github.repository }}

          # GitHub token for API access (recommended to increase API rate limits)
          token: ${{ secrets.GITHUB_TOKEN }}

          # Optional: Save the analysis to a file
          output-file: 'repo-analysis.md'

          # Optional: Comment results on the PR (only works in PR workflows)
          comment-on-pr: 'true'

          # Optional: Comment mode - 'create-new' or 'update-existing'
          comment-mode: 'update-existing'

      - name: Display Risk Score
        run: echo "Repository Risk Score is ${{ steps.analysis.outputs.risk-score }} (${{ steps.analysis.outputs.risk-rating }})"

      - name: Archive Analysis Results
        uses: actions/upload-artifact@v3
        with:
          name: analysis-report
          path: repo-analysis.md
```

#### PR Commenting

When used in a pull request workflow, the action can automatically post analysis results as a comment on the PR:

- Set `comment-on-pr: 'true'` to enable this feature
- Use `comment-mode: 'update-existing'` (default) to update an existing comment if found, or create a new one
- Use `comment-mode: 'create-new'` to always create a new comment on each run

Example PR workflow focusing on the commenting feature:

```yaml
name: PR Analysis

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  analyze-pr:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write # Required for PR comments

    steps:
      - uses: actions/checkout@v3

      - name: Analyze Repository
        uses: billyjbryant/git-assure@v0
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          comment-on-pr: 'true'
```

**Note:** Make sure your workflow has `pull-requests: write` permission when using the PR commenting feature.

## Output

The analysis provides information about:

- Repository age and activity
- Contributor metrics
- Security policy and practices
- License information
- Dependencies and vulnerabilities
- Code quality indicators
- Documentation quality
- Community health
- Release practices

It also generates:

- A risk score (numerical value)
- A risk rating (Low, Medium, High)
- A detailed markdown report with all findings

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes. Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for more details.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
