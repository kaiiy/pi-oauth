import { CodexClient } from "../src/client.js";

const model = "gpt-5.5";

const client = new CodexClient({
  defaultModel: model,
});

console.log("stream text:");

const responseStream = await client.stream({
  model,
  input: [
    { role: "system", content: "You are a concise coding assistant." },
    { role: "user", content: "PythonでJSONをPOSTする最小コードを書いて" },
  ],
});

for await (const event of responseStream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

console.log();

const finalResponse = await responseStream.result();
console.log(finalResponse.content);
