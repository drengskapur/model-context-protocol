# Model Context Protocol (MCP)

A protocol for communication between Large Language Models (LLMs) and their context. MCP enables LLMs to:
- Access and manipulate resources in their environment
- Call tools and functions
- Manage prompts and completions
- Handle real-time updates through subscriptions

## Protocol Version

This package implements:
- Protocol Version: `2024-11-05`
- JSON-RPC Version: `2.0`

## Installation

```bash
npm install model-context-protocol
```

## Usage

```typescript
import { McpClient, McpServer, InMemoryTransport } from 'model-context-protocol';

// Create a client
const client = new McpClient({
  name: "example-client",
  version: "1.0.0"
});

// Create a server
const server = new McpServer({
  name: "example-server",
  version: "1.0.0"
});

// Connect using any transport (e.g., InMemory, SSE, STDIO)
const transport = new InMemoryTransport();
await client.connect(transport);
```

## Features

- **Transport Agnostic**: Supports multiple transport mechanisms (SSE, STDIO, InMemory)
- **Type-Safe**: Built with TypeScript for excellent type safety and IDE support
- **Extensible**: Easy to add new capabilities and custom message types
- **Real-time**: Support for subscriptions and real-time updates
- **Versioned**: Clear protocol versioning for compatibility
- **Quality Assurance**: Enforced code quality through Husky git hooks and lint-staged

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Test
pnpm test

# Lint and format code
pnpm lint
pnpm format

# Type check
pnpm typecheck

# Watch mode for development
pnpm dev
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (uses commitlint to enforce conventional commits)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## License

MIT

## About

This server implementation is part of the Model Context Protocol ecosystem, enabling standardized communication between LLM applications and context providers.
