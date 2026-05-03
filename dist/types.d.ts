import { type complete, type getModel, type stream, type Context, type ProviderStreamOptions } from "@mariozechner/pi-ai";
import type { OAuthCredentials, OAuthPrompt, loginOpenAICodex } from "@mariozechner/pi-ai/oauth";
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
    onAuth(details: {
        url: string;
        instructions?: string;
    }): void;
    onPrompt(prompt: OAuthPrompt): Promise<string>;
    onProgress(message: string): void;
}
export interface OAuthProvider {
    id: string;
    displayName: string;
    defaultAuthPath: string;
    login(handlers: OAuthLoginHandlers): Promise<OAuthCredentials>;
}
export type ApiKeyResult = {
    newCredentials: OAuthCredentials;
    apiKey: string;
} | null;
export interface Deps {
    complete: typeof complete;
    stream: typeof stream;
    getModel: typeof getModel;
    getOAuthApiKey: (providerId: string, credentials: Record<string, OAuthCredentials>) => Promise<ApiKeyResult>;
}
export interface ClientOptions {
    authPath?: string;
    defaultModel?: string;
    systemPrompt?: string | null;
    deps?: Partial<Deps>;
}
export interface CodexClientOptions extends ClientOptions {
    deps?: Partial<Deps> & {
        loginOpenAICodex?: typeof loginOpenAICodex;
    };
}
export interface PiOAuthClientOptions extends ClientOptions {
    provider: OAuthProvider;
}
