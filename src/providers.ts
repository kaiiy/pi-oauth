import { loginOpenAICodex } from "@mariozechner/pi-ai/oauth";

import type { OAuthProvider } from "./types.js";

export const openAICodexProvider: OAuthProvider = {
  id: "openai-codex",
  displayName: "OpenAI Codex",
  defaultAuthPath: "~/.config/pi-codex/auth.json",
  login: loginOpenAICodex,
};
