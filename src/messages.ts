import type { Context, Message, Model, Usage } from "@mariozechner/pi-ai";

import type { ClientInput, SimpleMessage } from "./types.js";

const normalizeInput = (
  input: ClientInput,
  model: Model<any>,
  defaultSystemPrompt: string | undefined,
): Context => {
  if (input === undefined) {
    throw new Error("No input specified. Pass input in the request.");
  }

  if (typeof input === "string") {
    return { systemPrompt: defaultSystemPrompt, messages: [userMessage(input)] };
  }

  if (!Array.isArray(input)) {
    return input;
  }

  const system: SimpleMessage[] = [];
  const messages: SimpleMessage[] = [];
  let sawNonSystem = false;

  for (const item of input) {
    if (item.role === "system") {
      if (sawNonSystem) {
        throw new Error(
          'System messages are only supported at the beginning of the conversation. Move later "system" messages to the front or merge them into one initial system message.',
        );
      }
      system.push(item);
      continue;
    }

    sawNonSystem = true;
    messages.push(item);
  }

  const systemPrompt = system.length > 0 ? system.map((msg) => msg.content).join("\n\n") : defaultSystemPrompt;

  return {
    systemPrompt,
    messages: messages.map((msg) => toMessage(msg, model)),
  };
};

const toMessage = (msg: SimpleMessage, model: Model<any>): Message => {
  if (msg.role === "user") {
    return userMessage(msg.content);
  }

  return {
    role: "assistant",
    content: [{ type: "text", text: msg.content }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: emptyUsage(),
    stopReason: "stop",
    timestamp: Date.now(),
  };
};

const userMessage = (content: string): Message => {
  return {
    role: "user",
    content,
    timestamp: Date.now(),
  };
};

const emptyUsage = (): Usage => {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
};

export { normalizeInput };
