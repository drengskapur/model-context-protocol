import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONRPCMessage } from '../schema.js';
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

    const handler = vi.fn().mockImplementation(async () => {
      // Mock handler - intentionally empty
    });
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

    const handler = vi.fn().mockImplementation(async () => {
      // Mock handler - intentionally empty
    });
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

    const handler = vi.fn().mockImplementation(async () => {
      // Mock handler - intentionally empty
    });
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
    const errorHandler = vi.fn();
    transport.onError(errorHandler);
    transport.onMessage(vi.fn());
    await transport.connect();

    input.push('invalid json\n');

    // Wait for error processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Error parsing message'),
      })
    );
  });

  it('should handle invalid message schema errors', async () => {
    const errorHandler = vi.fn();
    transport.onError(errorHandler);
    transport.onMessage(vi.fn());
    await transport.connect();

    input.push('{"jsonrpc":"1.0","method":"test"}\n'); // Wrong version

    // Wait for error processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Error processing message'),
      })
    );
  });

  it('should handle stream errors', async () => {
    const errorHandler = vi.fn();
    transport.onError(errorHandler);
    await transport.connect();

    const error = new Error('Stream error');
    input.emit('error', error);

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Stream error'),
      })
    );
  });

  it('should handle write errors', async () => {
    const errorOutput = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error('Write error'));
      },
    });
    const errorTransport = new StdioTransport(input, errorOutput);
    await errorTransport.connect();

    await expect(
      errorTransport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      })
    ).rejects.toThrow('Write error');

    await errorTransport.close();
  });

  it('should handle message handler errors', async () => {
    const errorHandler = vi.fn();
    transport.onError(errorHandler);
    transport.onMessage(() => {
      throw new Error('Handler error');
    });
    await transport.connect();

    input.push('{"jsonrpc":"2.0","method":"test"}\n');

    // Wait for error processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Error in message handler'),
      })
    );
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

  it('should prevent double connect', async () => {
    await transport.connect();
    try {
      await transport.connect();
      throw new Error('Expected connect to throw');
    } catch (error) {
      expect((error as Error).message).toBe(
        'StdioTransport already connected! Call close() before connecting again.'
      );
    }
  });

  it('should handle error handler registration', async () => {
    const handler = vi.fn();
    transport.onError(handler);
    transport.offError(handler);

    // Trigger an error
    await transport.connect();
    input.push('invalid json\n');

    // Wait for error processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle message handler registration', async () => {
    const handler = vi.fn();
    transport.onMessage(handler);
    transport.offMessage(handler);

    await transport.connect();
    input.push('{"jsonrpc":"2.0","method":"test"}\n');

    // Wait for message processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });

  it('should send progress notifications', async () => {
    await transport.connect();
    await transport.sendProgress('test-token', 50, 100);

    expect(outputData).toHaveLength(1);
    const message = JSON.parse(outputData[0]);
    expect(message).toMatchObject({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken: 'test-token',
        progress: 50,
        total: 100,
      },
    });
  });

  it('should send cancellation notifications', async () => {
    await transport.connect();
    await transport.cancelRequest(1, 'Test cancellation');

    expect(outputData).toHaveLength(1);
    const message = JSON.parse(outputData[0]);
    expect(message).toMatchObject({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: {
        requestId: 1,
        reason: 'Test cancellation',
      },
    });
  });

  it('should handle disconnect', async () => {
    await transport.connect();
    await transport.disconnect();

    await expect(
      transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      })
    ).rejects.toThrow('StdioTransport not connected');
  });

  it('should handle close on non-process streams', async () => {
    const customInput = new Readable({
      read() {
        // Empty
      },
    });
    const customOutput = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const customTransport = new StdioTransport(customInput, customOutput);

    await customTransport.connect();
    await customTransport.close();

    expect(customInput.destroyed).toBe(true);
    expect(customOutput.destroyed).toBe(true);
  });
});
