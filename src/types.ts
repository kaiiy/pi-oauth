import {
  type Context,
  type ProviderStreamOptions,
} from "@mariozechner/pi-ai";
import type { OAuthCredentials, OAuthPrompt } from "@mariozechner/pi-ai/oauth";

export type Role = "system" | "user" | "assistant";

export interface SimpleMessage {
  role: Role;
  content: string;
}

export interface CompleteParams {
  model?: string;
  input: ClientInput;
  systemPrompt?: string | null;
  options?: Omit<ProviderStreamOptions, "apiKey">;
}

export type ClientInput = string | SimpleMessage[] | Context;

export interface OAuthLoginHandlers {
  onAuth(details: { url: string; instructions?: string }): void;
  onPrompt(prompt: OAuthPrompt): Promise<string>;
  onProgress(message: string): void;
}

export interface OAuthProvider {
  id: string;
  displayName: string;
  defaultAuthPath: string;
  login(handlers: OAuthLoginHandlers): Promise<OAuthCredentials>;
}

export interface ClientOptions {
  authPath?: string;
  defaultModel?: string;
  systemPrompt?: string | null;
}

export interface PiOAuthClientOptions extends ClientOptions {
  provider: OAuthProvider;
}
