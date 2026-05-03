import { loginOpenAICodex } from "@mariozechner/pi-ai/oauth";
export const openAICodexProvider = {
    id: "openai-codex",
    displayName: "OpenAI Codex",
    defaultAuthPath: "~/.config/pi-codex/auth.json",
    login: loginOpenAICodex,
};
