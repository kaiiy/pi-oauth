import { type AssistantMessage, type AssistantMessageEventStream } from "@mariozechner/pi-ai";
import type { CompleteParams, ClientOptions, PiOAuthClientOptions } from "./types.js";
export declare class PiOAuthClient {
    private readonly defaultModel?;
    private readonly defaultSystemPrompt;
    private readonly auth;
    private readonly provider;
    constructor(opts: PiOAuthClientOptions);
    login: () => Promise<void>;
    ensureLogin: () => Promise<void>;
    private resolveModel;
    complete: (params: CompleteParams) => Promise<AssistantMessage>;
    stream: (params: CompleteParams) => Promise<AssistantMessageEventStream>;
    private resolveRequest;
    private resolveSystemPrompt;
}
export declare class CodexClient extends PiOAuthClient {
    constructor(opts?: ClientOptions);
}
