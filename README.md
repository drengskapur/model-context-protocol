# Model Context Protocol

A type-safe JSON-RPC based protocol for AI model interactions with built-in context management.

[![npm version](https://badge.fury.io/js/%40model-context-protocol%2Fcore.svg)](https://badge.fury.io/js/%40model-context-protocol%2Fcore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🔒 **Type-safe**: Built with TypeScript and runtime validation using Valibot
- 🔄 **Context-aware**: Built-in support for managing conversation context
- 🛠️ **Extensible**: Plugin architecture for custom tools and capabilities
- 🚀 **Transport agnostic**: Works with any transport layer (WebSocket, SSE, etc.)
- 📦 **Zero dependencies**: Core package has minimal dependencies

## Installation

```bash
# Using npm
npm install @model-context-protocol/core

# Using yarn
yarn add @model-context-protocol/core

# Using pnpm
pnpm add @model-context-protocol/core
```

## Quick Start

```typescript
import { McpServer, McpClient } from '@model-context-protocol/core';

// Server-side
const server = new McpServer({
  name: 'my-server',
  version: '1.0.0'
});

server.tool('greet', {
  name: string(),
  age: number()
}, async (params) => {
  return `Hello ${params.name}, you are ${params.age} years old!`;
});

// Client-side
const client = new McpClient();
await client.connect(transport);

const response = await client.invoke('greet', {
  name: 'Alice',
  age: 25
});
console.log(response); // "Hello Alice, you are 25 years old!"
```

## Core Concepts

### Tools

Tools are the primary way to extend the server's capabilities. Each tool:
- Has a unique name
- Defines its input schema using Valibot
- Returns a Promise with the result
- Can be async and perform external operations

```typescript
server.tool('summarize', {
  text: string(),
  maxLength: optional(number())
}, async (params) => {
  // Implement text summarization
  return summary;
});
```

### Resources

Resources represent persistent data that can be:
- Listed
- Read
- Subscribed to for changes
- Updated through templates

```typescript
server.resource({
  uri: 'conversations/123',
  mimeType: 'application/json',
  content: { messages: [] }
});
```

### Authentication

Built-in JWT-like token authentication with role-based access control:

```typescript
const auth = new Authorization({
  tokenExpiration: 3600 // 1 hour
});

const token = auth.generateToken('user-123', ['user']);
await auth.verifyPermission(token, ['admin']); // false
```
