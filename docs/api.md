# API Reference

`pi-oauth` は `CodexClient` を主な入口として公開しています。

```ts
import { CodexClient } from "pi-oauth";
```

`CodexClient` は `PiOAuthClient` の OpenAI Codex preset です。`login()`、`ensureLogin()`、`complete()`、`stream()` は `PiOAuthClient` から継承しています。

## CodexClient

```ts
class CodexClient extends PiOAuthClient {
  constructor(opts?: ClientOptions);
}
```

OpenAI Codex 用の provider 設定を持つ client です。通常はこちらを使います。

```ts
const client = new CodexClient({
  defaultModel: "gpt-5.5",
});
```

### ClientOptions

```ts
interface ClientOptions {
  authPath?: string;
  defaultModel?: string;
  systemPrompt?: string | null;
}
```

## PiOAuthClient

```ts
class PiOAuthClient {
  constructor(opts: PiOAuthClientOptions);
  login(): Promise<void>;
  ensureLogin(): Promise<void>;
  complete(params: CompleteParams): Promise<AssistantMessage>;
  stream(params: CompleteParams): Promise<AssistantMessageEventStream>;
}
```

任意の OAuth provider を渡して使う汎用 client です。Codex 以外の provider を追加するときは、この class に `OAuthProvider` を渡します。

```ts
const client = new PiOAuthClient({
  provider,
  defaultModel: "gpt-5.5",
});
```

### PiOAuthClientOptions

```ts
interface PiOAuthClientOptions extends ClientOptions {
  provider: OAuthProvider;
}
```

### ClientOptions

```ts
interface ClientOptions {
  authPath?: string;
  defaultModel?: string;
  systemPrompt?: string | null;
}
```

- `authPath`: OAuth credentials を保存する JSON file path。`~` と `~/` を展開します。
- `defaultModel`: request ごとに `model` を渡さない場合に使う model id。
- `systemPrompt`: `string` input や `SimpleMessage[]` input で、request に `systemPrompt` がない場合に使う system prompt。省略すると system prompt は使いません。

## Authentication

### login

```ts
login(): Promise<void>;
```

OAuth login flow を開始し、取得した credentials を `authPath` に保存します。保存ファイルは owner のみ読み書きできる `0600` に設定されます。

### ensureLogin

```ts
ensureLogin(): Promise<void>;
```

保存済み credentials があれば何もしません。なければ `login()` を実行します。

`CodexClient` の場合、auth file に保存される key は `openai-codex` です。

```json
{
  "openai-codex": {
    "type": "oauth",
    "...OAuthCredentials": "..."
  }
}
```

## Generation

### complete

```ts
client.complete(params: CompleteParams): Promise<AssistantMessage>;
```

`pi-ai` の `AssistantMessage` をそのまま返す native API です。provider から返った `content`、`usage`、`stopReason`、`responseId` などを直接扱えます。

```ts
const message = await client.complete({
  model: "gpt-5.5",
  input: "TypeScriptで最小のHTTPサーバを書いて",
});

const text = message.content
  .filter((block) => block.type === "text")
  .map((block) => block.text)
  .join("");
```

tool call や thinking block も `message.content` に残ります。

### stream

```ts
client.stream(params: CompleteParams): Promise<AssistantMessageEventStream>;
```

`pi-ai` の `AssistantMessageEventStream` を返す native streaming API です。OAuth credentials の解決が非同期なので、戻り値は `Promise` です。

```ts
const stream = await client.stream({
  input: "PythonでJSONをPOSTする最小コードを書いて",
});

for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

const final = await stream.result();
```

## Input Types

### CompleteParams

```ts
interface CompleteParams {
  model?: string;
  input: ClientInput;
  systemPrompt?: string | null;
  options?: Omit<ProviderStreamOptions, "apiKey">;
}
```

`model` を省略した場合は constructor の `defaultModel` を使います。どちらも未指定の場合は error になります。

`systemPrompt` は `string` input や `SimpleMessage[]` input に system prompt として使われます。省略した場合は constructor の `systemPrompt` を使います。`input` に `system` message がある場合は、その system message が優先されます。`null` または空文字を渡すと request 単位で system prompt を使いません。`Context` を渡す場合は `Context.systemPrompt` を使ってください。

`options` は `pi-ai` の `ProviderStreamOptions` です。ただし `apiKey` は `pi-oauth` が OAuth credentials から解決するため指定しません。

```ts
await client.complete({
  input: "短く答えて",
  options: {
    temperature: 0.2,
    maxTokens: 128,
  },
});
```

### ClientInput

```ts
type ClientInput = string | SimpleMessage[] | Context;
```

`Context` は `pi-ai` の native conversation 型です。tools や image input など、`pi-ai` の機能を直接使いたい場合は `Context` を渡してください。

### SimpleMessage

```ts
type Role = "system" | "user" | "assistant";

interface SimpleMessage {
  role: Role;
  content: string;
}
```

`system` message は conversation の先頭にだけ置けます。途中に `system` message がある場合は error になります。

```ts
await client.complete({
  input: [
    { role: "system", content: "You are concise." },
    { role: "user", content: "GoでJSONをPOSTする最小コードを書いて" },
  ],
});
```

## Output Types

### AssistantMessage

`complete()` は `@mariozechner/pi-ai` の `AssistantMessage` を返します。

主に見る field は次の通りです。

- `content`: text、thinking、toolCall などの content block。
- `usage`: token usage と cost。
- `stopReason`: `stop`、`length`、`toolUse`、`error`、`aborted`。
- `responseId`: provider が返す upstream response id。

### AssistantMessageEventStream

`stream()` は `@mariozechner/pi-ai` の `AssistantMessageEventStream` を返します。

主な event は次の通りです。

- `text_delta`: text の差分。
- `thinking_delta`: thinking の差分。
- `toolcall_delta`: tool call arguments の差分。
- `done`: 完了 event。
- `error`: provider error または abort。

最終的な `AssistantMessage` は `await stream.result()` で取得できます。

## Custom Provider

### OAuthProvider

```ts
interface OAuthProvider {
  id: string;
  displayName: string;
  defaultAuthPath: string;
  login(handlers: OAuthLoginHandlers): Promise<OAuthCredentials>;
}
```

- `id`: `@mariozechner/pi-ai` の provider id と auth file の key に使います。
- `displayName`: error message に使う表示名。
- `defaultAuthPath`: `authPath` 未指定時の保存先。
- `login`: OAuth login flow を実行して credentials を返します。

### OAuthLoginHandlers

```ts
interface OAuthLoginHandlers {
  onAuth(details: { url: string; instructions?: string }): void;
  onPrompt(prompt: OAuthPrompt): Promise<string>;
  onProgress(message: string): void;
}
```

`login()` 実装から CLI 表示、prompt、progress 表示を呼び出すための handlers です。

### openAICodexProvider

```ts
const openAICodexProvider: OAuthProvider;
```

`CodexClient` が内部で使っている OpenAI Codex 用 provider preset です。

## Error Behavior

- credentials がない場合は `Call await client.login() first.` を含む error を throw します。
- auth file の権限エラーは握りつぶさず、そのまま throw します。
- model が指定されていない場合は、request の `model` または constructor の `defaultModel` が必要です。
- provider に model が見つからない場合は、provider id と model id を含む error を throw します。
- `complete()` の final response の `stopReason` が `error` または `aborted` の場合は exception として扱います。
