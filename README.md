# pi-oauth

OAuth で取得した資格情報を使って、`@mariozechner/pi-ai` の provider を扱う小さな native client です。

今は OpenAI Codex 用の `CodexClient` を提供しています。将来ほかの provider を追加する場合は、`PiOAuthClient` に provider 定義を渡して拡張できます。

返り値と stream event は `pi-ai` native の `AssistantMessage` / `AssistantMessageEventStream` です。tools、thinking、image などの rich content を変換 layer で削らず、そのまま扱えます。

## Install

```bash
yarn add https://github.com/kaiiy/pi-oauth
```

詳しい型定義と method の説明は [docs/api.md](docs/api.md) を見てください。

## 初回 login

```ts
import { CodexClient } from "pi-oauth";

const client = new CodexClient({
  defaultModel: "gpt-5.5",
});

await client.login();
```

`login()` は毎回 OAuth を開始します。保存済み資格情報があれば再利用し、なければログインするだけにしたい場合は `ensureLogin()` を使います。

```ts
await client.ensureLogin();
```

実行サンプルは 3 つに分かれています。
- [examples/login.ts](examples/login.ts)
- [examples/create.ts](examples/create.ts)
- [examples/stream.ts](examples/stream.ts)

`create` と `stream` のサンプルは自動ログインしません。未認証なら `await client.login() first` を含むエラーで失敗します。

```bash
yarn tsx examples/create.ts
```

ストリームだけ試したい場合はこちらです。

```bash
yarn tsx examples/stream.ts
```

`login()` だけ試したい場合はこちらです。

```bash
yarn tsx examples/login.ts
```

`authPath` を省略した場合、資格情報は `~/.config/pi-codex/auth.json` に保存されます。
認証ファイルは owner のみ読み書きできる権限 (`0600`) で保存されます。

初回ログイン後は認証ファイルに最低限この形式で保存されます。

```json
{
  "openai-codex": {
    "type": "oauth",
    "...OAuthCredentials": "..."
  }
}
```

## complete

```ts
import { CodexClient } from "pi-oauth";

const client = new CodexClient({
  defaultModel: "gpt-5.5",
});

const message = await client.complete({
  input: "TypeScriptで最小のHTTPサーバを書いて",
});

for (const block of message.content) {
  if (block.type === "text") {
    process.stdout.write(block.text);
  }
}
```

`complete()` は `pi-ai` の `AssistantMessage` をそのまま返します。tool call や thinking block も `message.content` に残ります。

## complete with messages

```ts
import { CodexClient } from "pi-oauth";

const client = new CodexClient({
  defaultModel: "gpt-5.5",
});

const message = await client.complete({
  input: [
    { role: "system", content: "You are a concise coding assistant." },
    { role: "user", content: "GoでJSONをPOSTする最小コードを書いて" },
  ],
});

console.log(message.content);
```

## complete with pi-ai Context

```ts
import { CodexClient } from "pi-oauth";

const client = new CodexClient({
  defaultModel: "gpt-5.5",
});

const message = await client.complete({
  input: {
    systemPrompt: "You are a careful coding assistant.",
    messages: [
      {
        role: "user",
        content: "TypeScriptでJSONをPOSTする最小コードを書いて",
        timestamp: Date.now(),
      },
    ],
    tools: [],
  },
});

console.log(message.content);
```

## stream

```ts
const s = await client.stream({
  input: "TypeScriptで最小のHTTPサーバを書いて",
});

for await (const event of s) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

const final = await s.result();
console.log(final.content);
```

## Provider options

`options` は `pi-ai` の provider options です。`apiKey` は OAuth credentials から解決するため指定しません。

```ts
const message = await client.complete({
  input: "短く答えて",
  systemPrompt: "You are concise.",
  options: {
    temperature: 0.2,
    maxTokens: 128,
  },
});
```

default system prompt を使いたくない場合は `systemPrompt: null` を渡します。

## Custom provider

```ts
import { PiOAuthClient, type OAuthProvider } from "pi-oauth";

const provider: OAuthProvider = {
  id: "github-copilot",
  displayName: "GitHub Copilot",
  defaultAuthPath: "~/.config/pi-oauth/copilot.json",
  login: async (handlers) => {
    // OAuth login flow を実行して OAuthCredentials を返します。
    handlers.onProgress("Starting login...");
    return {
      access: "...",
      refresh: "...",
      expires: Date.now() + 3600_000,
    };
  },
};

const client = new PiOAuthClient({
  provider,
  defaultModel: "gpt-5.5",
});
```

## package.json example

```json
{
  "packageManager": "yarn@4.13.0",
  "type": "module",
  "dependencies": {
    "pi-oauth": "https://github.com/kaiiy/pi-oauth"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "typescript": "^6.0.3"
  },
  "scripts": {
    "start": "tsx src/index.ts"
  }
}
```
