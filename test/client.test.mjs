import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { CodexClient, PiOAuthClient } from "../dist/index.js";

function createModel() {
  return {
    id: "gpt-5.4",
    api: "openai-codex-responses",
    provider: "openai-codex",
  };
}

function createAssistantMessage(overrides = {}) {
  return {
    role: "assistant",
    content: [{ type: "text", text: "Hello world" }],
    api: "openai-codex-responses",
    provider: "openai-codex",
    model: "gpt-5.4",
    responseId: "resp_123",
    usage: {
      input: 1,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 3,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
    ...overrides,
  };
}

function createEventStream(events, result) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    result: async () => result,
  };
}

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "pi-oauth-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("login writes auth.json in the expected format", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "nested", "auth.json");
    const client = new CodexClient({
      authPath,
      deps: {
        loginOpenAICodex: async () => ({
          access: "access-token",
          refresh: "refresh-token",
          expires: 1234567890,
        }),
      },
    });

    await client.login();

    const auth = JSON.parse(await readFile(authPath, "utf8"));
    assert.deepEqual(auth, {
      "openai-codex": {
        type: "oauth",
        access: "access-token",
        refresh: "refresh-token",
        expires: 1234567890,
      },
    });
  });
});

test("login stores auth.json with owner-only permissions", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    const client = new CodexClient({
      authPath,
      deps: {
        loginOpenAICodex: async () => ({
          access: "access-token",
          refresh: "refresh-token",
          expires: 1234567890,
        }),
      },
    });

    await client.login();

    const mode = (await stat(authPath)).mode & 0o777;
    assert.equal(mode, 0o600);
  });
});

test("ensureLogin skips browser login when auth.json already has credentials", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "existing-access",
          refresh: "existing-refresh",
          expires: 123,
        },
      }),
    );

    let called = false;
    const client = new CodexClient({
      authPath,
      deps: {
        loginOpenAICodex: async () => {
          called = true;
          return {
            access: "new-access",
            refresh: "new-refresh",
            expires: 456,
          };
        },
      },
    });

    await client.ensureLogin();

    assert.equal(called, false);
    const auth = JSON.parse(await readFile(authPath, "utf8"));
    assert.deepEqual(auth, {
      "openai-codex": {
        type: "oauth",
        access: "existing-access",
        refresh: "existing-refresh",
        expires: 123,
      },
    });
  });
});

test("ensureLogin starts browser login when auth.json is missing", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    let called = false;

    const client = new CodexClient({
      authPath,
      deps: {
        loginOpenAICodex: async () => {
          called = true;
          return {
            access: "access-token",
            refresh: "refresh-token",
            expires: 1234567890,
          };
        },
      },
    });

    await client.ensureLogin();

    assert.equal(called, true);
    const auth = JSON.parse(await readFile(authPath, "utf8"));
    assert.deepEqual(auth, {
      "openai-codex": {
        type: "oauth",
        access: "access-token",
        refresh: "refresh-token",
        expires: 1234567890,
      },
    });
  });
});

test("ensureLogin serializes concurrent login attempts", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    let calls = 0;

    const client = new CodexClient({
      authPath,
      deps: {
        loginOpenAICodex: async () => {
          calls += 1;
          return {
            access: "access-token",
            refresh: "refresh-token",
            expires: 1234567890,
          };
        },
      },
    });

    await Promise.all([client.ensureLogin(), client.ensureLogin()]);

    assert.equal(calls, 1);
  });
});

test("complete throws a clear error before login", async () => {
  await withTempDir(async (dir) => {
    const client = new CodexClient({
      authPath: join(dir, "auth.json"),
      defaultModel: "gpt-5.4",
      deps: {
        getModel: () => createModel(),
      },
    });

    await assert.rejects(
      () => client.complete({ input: "hello" }),
      /Call await client\.login\(\) first\./,
    );
  });
});

test("default authPath points to ~/.config/pi-codex/auth.json", async () => {
  const client = new CodexClient({
    defaultModel: "gpt-5.4",
    deps: {
      getModel: () => createModel(),
      getOAuthApiKey: async () => null,
    },
  });

  await assert.rejects(
    () => client.complete({ input: "hello" }),
    (err) => {
      assert.match(err.message, /Call await client\.login\(\) first\./);
      assert.match(err.message, new RegExp(`${homedir()}/\\.config/pi-codex/auth\\.json`));
      return true;
    },
  );
});

test("complete refreshes credentials, saves them, and returns the native AssistantMessage", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "old-access",
          refresh: "old-refresh",
          expires: 1,
        },
      }),
    );

    let receivedContext;
    let receivedOptions;

    const raw = createAssistantMessage({
      content: [
        { type: "text", text: "Hello" },
        { type: "text", text: " world" },
      ],
    });

    const client = new CodexClient({
      authPath,
      defaultModel: "gpt-5.4",
      deps: {
        getModel: () => createModel(),
        getOAuthApiKey: async () => ({
          apiKey: "fresh-api-key",
          newCredentials: {
            access: "new-access",
            refresh: "new-refresh",
            expires: 999,
          },
        }),
        complete: async (_model, context, options) => {
          receivedContext = context;
          receivedOptions = options;
          return raw;
        },
      },
    });

    const result = await client.complete({
      input: "TypeScriptで最小のHTTPサーバを書いて",
    });

    assert.equal(result, raw);
    assert.deepEqual(result.content, [
      { type: "text", text: "Hello" },
      { type: "text", text: " world" },
    ]);
    assert.deepEqual(receivedContext.messages, [
      {
        role: "user",
        content: "TypeScriptで最小のHTTPサーバを書いて",
        timestamp: receivedContext.messages[0].timestamp,
      },
    ]);
    assert.equal(receivedContext.systemPrompt, "You are a helpful coding assistant.");
    assert.deepEqual(receivedOptions, { apiKey: "fresh-api-key" });

    const auth = JSON.parse(await readFile(authPath, "utf8"));
    assert.deepEqual(auth, {
      "openai-codex": {
        type: "oauth",
        access: "new-access",
        refresh: "new-refresh",
        expires: 999,
      },
    });
  });
});

test("complete returns the native pi-ai AssistantMessage", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "token",
          refresh: "refresh",
          expires: 1,
        },
      }),
    );

    const raw = createAssistantMessage();
    const client = new CodexClient({
      authPath,
      defaultModel: "gpt-5.4",
      deps: {
        getModel: () => createModel(),
        getOAuthApiKey: async () => ({
          apiKey: "api-key",
          newCredentials: {
            access: "token-2",
            refresh: "refresh-2",
            expires: 2,
          },
        }),
        complete: async () => raw,
      },
    });

    const result = await client.complete({ input: "hello" });

    assert.equal(result, raw);
    assert.equal(result.content[0].text, "Hello world");
  });
});

test("stream returns the native pi-ai AssistantMessageEventStream", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "token",
          refresh: "refresh",
          expires: 1,
        },
      }),
    );

    const raw = createAssistantMessage();
    const nativeStream = createEventStream([{ type: "done", reason: "stop", message: raw }], raw);
    const client = new CodexClient({
      authPath,
      defaultModel: "gpt-5.4",
      deps: {
        getModel: () => createModel(),
        getOAuthApiKey: async () => ({
          apiKey: "api-key",
          newCredentials: {
            access: "token-2",
            refresh: "refresh-2",
            expires: 2,
          },
        }),
        stream: async () => nativeStream,
      },
    });

    const result = await client.stream({ input: "hello" });

    assert.equal(result, nativeStream);
    assert.equal(await result.result(), raw);
  });
});

test("PiOAuthClient accepts a custom OAuth provider", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    const provider = {
      id: "github-copilot",
      displayName: "GitHub Copilot",
      defaultAuthPath: authPath,
      login: async () => ({
        access: "copilot-access",
        refresh: "copilot-refresh",
        expires: 123,
      }),
    };

    let requestedProvider;

    const client = new PiOAuthClient({
      provider,
      defaultModel: "gpt-5.4",
      deps: {
        getModel: (providerId) => {
          requestedProvider = providerId;
          return {
            id: "gpt-5.4",
            api: "github-copilot-responses",
            provider: providerId,
          };
        },
        getOAuthApiKey: async (providerId, credentials) => ({
          apiKey: `${providerId}-api-key`,
          newCredentials: {
            access: `${credentials[providerId].access}-2`,
            refresh: `${credentials[providerId].refresh}-2`,
            expires: 456,
          },
        }),
        complete: async () => createAssistantMessage(),
      },
    });

    await client.login();
    const response = await client.complete({ input: "hello" });

    assert.equal(requestedProvider, "github-copilot");
    assert.equal(response.content[0].text, "Hello world");

    const auth = JSON.parse(await readFile(authPath, "utf8"));
    assert.deepEqual(auth, {
      "github-copilot": {
        type: "oauth",
        access: "copilot-access-2",
        refresh: "copilot-refresh-2",
        expires: 456,
      },
    });
  });
});

test("complete serializes credential refreshes", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "old-access",
          refresh: "old-refresh",
          expires: 1,
        },
      }),
    );

    const receivedAccessTokens = [];

    const client = new CodexClient({
      authPath,
      defaultModel: "gpt-5.4",
      deps: {
        getModel: () => createModel(),
        getOAuthApiKey: async (_providerId, credentials) => {
          receivedAccessTokens.push(credentials["openai-codex"].access);
          const index = receivedAccessTokens.length;
          return {
            apiKey: `api-key-${index}`,
            newCredentials: {
              access: `new-access-${index}`,
              refresh: `new-refresh-${index}`,
              expires: index,
            },
          };
        },
        complete: async () => createAssistantMessage(),
      },
    });

    await Promise.all([
      client.complete({ input: "first" }),
      client.complete({ input: "second" }),
    ]);

    assert.deepEqual(receivedAccessTokens, ["old-access", "new-access-1"]);

    const auth = JSON.parse(await readFile(authPath, "utf8"));
    assert.deepEqual(auth, {
      "openai-codex": {
        type: "oauth",
        access: "new-access-2",
        refresh: "new-refresh-2",
        expires: 2,
      },
    });
  });
});

test("complete accepts message arrays and preserves system prompt", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "token",
          refresh: "refresh",
          expires: 1,
        },
      }),
    );

    let receivedContext;

    const client = new CodexClient({
      authPath,
      defaultModel: "gpt-5.4",
      deps: {
        getModel: () => createModel(),
        getOAuthApiKey: async () => ({
          apiKey: "api-key",
          newCredentials: {
            access: "token-2",
            refresh: "refresh-2",
            expires: 2,
          },
        }),
        complete: async (_model, context) => {
          receivedContext = context;
          return createAssistantMessage({
            stopReason: "toolUse",
            content: [{ type: "text", text: "Use curl here" }],
          });
        },
      },
    });

    const result = await client.complete({
      input: [
        { role: "system", content: "You are concise." },
        { role: "assistant", content: "Previous answer" },
        { role: "user", content: "Next question" },
      ],
    });

    assert.deepEqual(result.content, [{ type: "text", text: "Use curl here" }]);
    assert.equal(receivedContext.systemPrompt, "You are concise.");
    assert.equal(receivedContext.messages[0].role, "assistant");
    assert.deepEqual(receivedContext.messages[0].content, [{ type: "text", text: "Previous answer" }]);
    assert.equal(receivedContext.messages[1].role, "user");
    assert.equal(receivedContext.messages[1].content, "Next question");
  });
});

test("complete passes native pi-ai provider options", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "token",
          refresh: "refresh",
          expires: 1,
        },
      }),
    );

    let receivedContext;
    let receivedOptions;

    const client = new CodexClient({
      authPath,
      defaultModel: "gpt-5.4",
      deps: {
        getModel: () => createModel(),
        getOAuthApiKey: async () => ({
          apiKey: "api-key",
          newCredentials: {
            access: "token-2",
            refresh: "refresh-2",
            expires: 2,
          },
        }),
        complete: async (_model, context, options) => {
          receivedContext = context;
          receivedOptions = options;
          return createAssistantMessage();
        },
      },
    });

    const result = await client.complete({
      model: "gpt-5.4",
      systemPrompt: "You are terse.",
      input: "Write hello.",
      options: {
        temperature: 0.2,
        maxTokens: 128,
      },
    });

    assert.equal(result.content[0].text, "Hello world");
    assert.equal(receivedContext.systemPrompt, "You are terse.");
    assert.equal(receivedContext.messages[0].content, "Write hello.");
    assert.deepEqual(receivedOptions, {
      temperature: 0.2,
      maxTokens: 128,
      apiKey: "api-key",
    });
  });
});

test("complete injects default system prompt when no system message is provided", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "token",
          refresh: "refresh",
          expires: 1,
        },
      }),
    );

    let receivedContext;

    const client = new CodexClient({
      authPath,
      defaultModel: "gpt-5.4",
      deps: {
        getModel: () => createModel(),
        getOAuthApiKey: async () => ({
          apiKey: "api-key",
          newCredentials: {
            access: "token-2",
            refresh: "refresh-2",
            expires: 2,
          },
        }),
        complete: async (_model, context) => {
          receivedContext = context;
          return createAssistantMessage();
        },
      },
    });

    await client.complete({
      input: [{ role: "user", content: "hello" }],
    });

    assert.equal(receivedContext.systemPrompt, "You are a helpful coding assistant.");
  });
});

test("complete can disable the default system prompt", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "token",
          refresh: "refresh",
          expires: 1,
        },
      }),
    );

    let receivedContext;

    const client = new CodexClient({
      authPath,
      defaultModel: "gpt-5.4",
      systemPrompt: null,
      deps: {
        getModel: () => createModel(),
        getOAuthApiKey: async () => ({
          apiKey: "api-key",
          newCredentials: {
            access: "token-2",
            refresh: "refresh-2",
            expires: 2,
          },
        }),
        complete: async (_model, context) => {
          receivedContext = context;
          return createAssistantMessage();
        },
      },
    });

    await client.complete({
      input: "hello",
    });

    assert.equal(receivedContext.systemPrompt, undefined);

    await client.complete({
      input: "hello",
      systemPrompt: "Use a system prompt now.",
    });

    assert.equal(receivedContext.systemPrompt, "Use a system prompt now.");

    await client.complete({
      input: "hello",
      systemPrompt: null,
    });

    assert.equal(receivedContext.systemPrompt, undefined);
  });
});

test("complete rejects system messages that appear after non-system messages", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "token",
          refresh: "refresh",
          expires: 1,
        },
      }),
    );

    const client = new CodexClient({
      authPath,
      defaultModel: "gpt-5.4",
      deps: {
        getModel: () => createModel(),
        getOAuthApiKey: async () => ({
          apiKey: "api-key",
          newCredentials: {
            access: "token-2",
            refresh: "refresh-2",
            expires: 2,
          },
        }),
      },
    });

    await assert.rejects(
      () =>
        client.complete({
          input: [
            { role: "user", content: "hello" },
            { role: "system", content: "later system" },
          ],
        }),
      /System messages are only supported at the beginning of the conversation/,
    );
  });
});

test("complete throws a clear error when the model is missing", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "token",
          refresh: "refresh",
          expires: 1,
        },
      }),
    );

    const client = new CodexClient({
      authPath,
      deps: {
        getModel: () => {
          throw new Error("not found");
        },
      },
    });

    await assert.rejects(
      () => client.complete({ model: "does-not-exist", input: "hello" }),
      /Model "does-not-exist" was not found/,
    );
  });
});

test("LLM stopReason error and aborted responses are surfaced as exceptions", async () => {
  await withTempDir(async (dir) => {
    const authPath = join(dir, "auth.json");
    await writeFile(
      authPath,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "token",
          refresh: "refresh",
          expires: 1,
        },
      }),
    );

    const client = new CodexClient({
      authPath,
      defaultModel: "gpt-5.4",
      deps: {
        getModel: () => createModel(),
        getOAuthApiKey: async () => ({
          apiKey: "api-key",
          newCredentials: {
            access: "token-2",
            refresh: "refresh-2",
            expires: 2,
          },
        }),
        complete: async () =>
          createAssistantMessage({
            stopReason: "error",
            errorMessage: "provider failed",
          }),
      },
    });

    await assert.rejects(
      () => client.complete({ input: "hello" }),
      /provider failed/,
    );
  });
});
