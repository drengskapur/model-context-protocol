# Model Context Protocol (MCP)

A protocol for communication between Large Language Models (LLMs) and their context. MCP enables LLMs to:
- Access and manipulate resources in their environment
- Call tools and functions
- Manage prompts and completions
- Handle real-time updates through subscriptions

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

## Protocol Version

This package implements protocol version 2024-11-05.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Lint
npm run lint

# Format
npm run format
```

## License

MIT
