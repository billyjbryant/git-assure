# Contributing to GitHub Repository Analyzer

Thank you for your interest in contributing to the GitHub Repository Analyzer! This document provides guidelines and instructions for contributing to this project.

## Table of Contents

- [Contributing to GitHub Repository Analyzer](#contributing-to-github-repository-analyzer)
  - [Table of Contents](#table-of-contents)
  - [Code of Conduct](#code-of-conduct)
  - [Getting Started](#getting-started)
  - [Development Setup](#development-setup)
  - [Contribution Workflow](#contribution-workflow)
  - [Pull Request Guidelines](#pull-request-guidelines)
  - [Coding Standards](#coding-standards)
  - [Testing Guidelines](#testing-guidelines)
  - [Documentation](#documentation)
  - [Issue Reporting](#issue-reporting)
  - [Feature Requests](#feature-requests)

## Code of Conduct

This project adheres to our [Community Guidelines](COMMUNITY_GUIDELINES.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

Before you begin:

1. Make sure you have a [GitHub account](https://github.com/signup/free)
2. [Fork the repository](https://github.com/billyjbryant/github-repo-analyzer/fork) on GitHub
3. [Clone your fork](https://help.github.com/articles/cloning-a-repository/)

## Development Setup

1. Ensure you have Node.js 22.0.0 or later installed
2. Install dependencies:

   ```bash
   npm install
   ```

3. Make the CLI script executable:

   ```bash
   chmod +x bin/repo-analyzer
   ```

## Contribution Workflow

1. Create a new branch for your feature or bugfix:

   ```bash
   git checkout -b feature/your-feature-name
   ```

   or

   ```bash
   git checkout -b fix/issue-you-are-fixing
   ```

2. Make your changes, following our [coding standards](#coding-standards)

3. Add tests for your changes

4. Run tests and linting to ensure quality:

   ```bash
   npm test
   npm run lint
   ```

5. Format your code:

   ```bash
   npm run format
   ```

6. Commit your changes with conventional commits:

   ```bash
   git commit -m "feat: add new feature"
   ```

   or

   ```bash
   git commit -m "fix: resolve issue #123"
   ```

7. Push to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

8. [Create a pull request](https://github.com/billyjbryant/github-repo-analyzer/compare) from your fork to the main repository

## Pull Request Guidelines

- All pull requests should be made against the `main` branch
- Include a clear description and reference any related issues
- Make focused PRs that address a single concern
- Add/update tests that validate your changes
- Ensure all tests pass and there are no linting errors
- Update documentation if necessary
- PRs must receive approval from at least one maintainer

## Coding Standards

We use ESLint and Prettier to enforce coding standards:

- Follow JavaScript best practices
- Use meaningful variable and function names
- Write self-documenting code with comments where necessary
- Follow the project's established patterns and architecture

To check your code:

```bash
npm run lint
```

To automatically fix issues:

```bash
npm run lint:fix
npm run format
```

## Testing Guidelines

- Write tests for all new functionality
- Maintain or improve test coverage
- Test both happy path and edge cases
- Use descriptive test names

Run tests with:

```bash
npm test
```

For coverage report:

```bash
npm run test:coverage
```

## Documentation

- Update README.md with any user-facing changes
- Document all public APIs, functions, and components
- Use clear and concise language
- Include examples for complex features

## Issue Reporting

- Use the [issue tracker](https://github.com/billyjbryant/github-repo-analyzer/issues)
- Clearly describe the issue including steps to reproduce
- Include environment details (OS, Node.js version, etc.)
- For bugs, include error messages and screenshots if applicable

## Feature Requests

For feature requests:

1. Check that the feature hasn't already been requested
2. Explain the problem you're trying to solve
3. Describe the solution you'd like to see
4. Consider alternative approaches
5. Include any relevant examples

---

Thank you for contributing to GitHub Repository Analyzer!
