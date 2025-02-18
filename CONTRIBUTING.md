# Contributing to Model Context Protocol

Thank you for your interest in contributing to Model Context Protocol! This document provides guidelines and instructions for contributing.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Development Process

1. Fork the repository
2. Create a new branch for your feature/fix
3. Make your changes
4. Write/update tests
5. Run the test suite
6. Submit a pull request

### Setting Up Development Environment

```bash
# Clone your fork
git clone https://github.com/drengskapur/model-context-protocol.git
cd model-context-protocol

# Install dependencies
pnpm install

# Run tests
pnpm test

# Run linter
pnpm lint
```

### Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) for clear and maintainable commit messages:

```
type(scope): subject

body

BREAKING CHANGE: description
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style/formatting
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

### Pull Request Process

1. Update the README.md with details of changes to the interface
2. Update the CHANGELOG.md with a note describing your changes
3. The PR will be merged once you have the sign-off of at least one maintainer

### Testing

- Write tests for all new features and bug fixes
- Maintain or improve code coverage
- Run the entire test suite before submitting a PR

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

### Code Style

We use Biome for linting and formatting. Ensure your code follows our style guide:

```bash
# Run linter
pnpm lint

# Format code
pnpm format
```

## Documentation

- Update documentation for any changed functionality
- Use JSDoc comments for all public APIs
- Keep code examples in README.md up to date

## Questions?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Documentation improvements
- Questions about the codebase

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
