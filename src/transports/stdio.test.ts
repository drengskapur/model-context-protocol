import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONRPCMessage } from '../types.js';
import { StdioTransport } from './stdio.js';

describe('StdioTransport', () => {
  let input: Readable;
  let output: Writable;
  let transport: StdioTransport;
  let outputData: string[];

  beforeEach(() => {
    outputData = [];
    input = new Readable({
      read() {
        // This method is intentionally empty as we manually push data in tests
      },
    });
    output = new Writable({
      write(chunk, _encoding, callback) {
        outputData.push(chunk.toString());
        callback();
      },
    });
    transport = new StdioTransport(input, output);
  });

  afterEach(async () => {
    await transport.close();
    input.destroy();
    output.destroy();
  });

  it('should send messages correctly', async () => {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: { foo: 'bar' },
    };

    await transport.connect();
    await transport.send(message);

    expect(outputData).toHaveLength(1);
    const sentMessage = JSON.parse(outputData[0]);
    expect(sentMessage).toEqual(message);
  });

  it('should receive messages correctly', async () => {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: { foo: 'bar' },
    };

    const handler = vi.fn(async () => {});
    transport.onMessage(handler);
    await transport.connect();

    input.push(`${JSON.stringify(message)}\n`);

    // Wait for message processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledWith(message);
  });

  it('should handle multiple messages in single chunk', async () => {
    const messages: JSONRPCMessage[] = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'test1',
        params: { foo: 'bar' },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'test2',
        params: { baz: 'qux' },
      },
    ];

    const handler = vi.fn(async () => {});
    transport.onMessage(handler);
    await transport.connect();

    input.push(messages.map((m) => `${JSON.stringify(m)}\n`).join(''));

    // Wait for message processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledTimes(2);
    messages.forEach((message, i) => {
      expect(handler).toHaveBeenNthCalledWith(i + 1, message);
    });
  });

  it('should handle split messages across chunks', async () => {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: { foo: 'bar' },
    };

    const handler = vi.fn(async () => {});
    transport.onMessage(handler);
    await transport.connect();

    const messageStr = `${JSON.stringify(message)}\n`;
    input.push(messageStr.slice(0, 10));
    await new Promise((resolve) => setTimeout(resolve, 10));
    input.push(messageStr.slice(10));

    // Wait for message processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledWith(message);
  });

  it('should handle parse errors gracefully', async () => {
    const handler = vi.fn();
    const _errorHandler = vi.fn();
    transport.onMessage(handler);
    await transport.connect();

    input.push('invalid json\n');

    // Wait for error processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle close correctly', async () => {
    const handler = vi.fn();
    transport.onMessage(handler);
    await transport.connect();
    await transport.close();

    await expect(
      transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
        params: undefined,
      })
    ).rejects.toThrow('StdioTransport not connected');
  });
});
