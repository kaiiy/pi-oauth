import { CodexClient } from "../src/client.js";

const client = new CodexClient({
  defaultModel: "gpt-5.5",
});

await client.ensureLogin();

console.log("Credentials are ready.");
console.log("They were loaded from or saved to ~/.config/pi-codex/auth.json");
