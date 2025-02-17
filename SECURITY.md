# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Which versions are eligible for receiving such patches depends on the CVSS v3.0 Rating:

| Version | Supported          |
| ------- | ----------------- |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

Please report (suspected) security vulnerabilities via GitHub's security advisory feature:
https://github.com/drengskapur/model-context-protocol/security/advisories/new

You will receive a response from us within 48 hours. If the issue is confirmed, we will release a patch as soon as possible depending on complexity but historically within a few days.

## Security Considerations

The Model Context Protocol is designed to facilitate communication between LLMs and their context. When implementing MCP:

1. **Transport Security**
   - Always use secure transport mechanisms (e.g., HTTPS for SSE)
   - Validate all incoming messages against the protocol schema
   - Implement proper error handling for malformed messages

2. **Resource Access**
   - Implement proper access controls for resources
   - Validate resource paths to prevent path traversal
   - Sanitize all resource content before use

3. **Tool Execution**
   - Validate and sanitize all tool inputs
   - Implement proper sandboxing for tool execution
   - Consider rate limiting for resource-intensive operations

4. **Authentication & Authorization**
   - Implement proper authentication for sensitive operations
   - Use secure session management
   - Follow the principle of least privilege
