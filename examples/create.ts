import { CodexClient } from "../src/client.js";

const model = "gpt-5.5";

const client = new CodexClient({
  defaultModel: model,
});

const message = await client.complete({
  model,
  input: "TypeScriptで最小のHTTPサーバを書いて",
});

console.log("complete text:");
for (const block of message.content) {
  if (block.type === "text") {
    process.stdout.write(block.text);
  }
}
console.log();
