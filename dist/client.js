import { complete, getModel, stream } from "@mariozechner/pi-ai";
import { getOAuthApiKey } from "@mariozechner/pi-ai/oauth";
import { AuthStore } from "./auth.js";
import { normalizeInput } from "./messages.js";
import { openAICodexProvider } from "./providers.js";
export class PiOAuthClient {
    defaultModel;
    defaultSystemPrompt;
    deps;
    auth;
    provider;
    constructor(opts) {
        this.provider = opts.provider;
        this.defaultModel = opts.defaultModel;
        this.defaultSystemPrompt = opts.systemPrompt === undefined ? "You are a helpful coding assistant." : (opts.systemPrompt ?? undefined);
        this.deps = {
            complete,
            stream,
            getModel,
            getOAuthApiKey,
            ...opts.deps,
        };
        this.auth = new AuthStore(AuthStore.expandPath(opts.authPath ?? this.provider.defaultAuthPath), this.deps, this.provider);
    }
    login = async () => {
        await this.auth.login();
    };
    ensureLogin = async () => {
        await this.auth.ensureLogin();
    };
    resolveModel = (model) => {
        const id = model ?? this.defaultModel;
        if (!id) {
            throw new Error("No model specified. Pass model in the request or set defaultModel in the constructor.");
        }
        try {
            return this.deps.getModel(this.provider.id, id);
        }
        catch {
            throw new Error(`Model "${id}" was not found for provider "${this.provider.id}".`);
        }
    };
    complete = async (params) => {
        const request = await this.resolveRequest(params);
        const raw = await this.deps.complete(request.model, request.context, request.options);
        assertOk(raw);
        return raw;
    };
    stream = async (params) => {
        const request = await this.resolveRequest(params);
        return this.deps.stream(request.model, request.context, request.options);
    };
    resolveRequest = async (params) => {
        const model = this.resolveModel(params.model);
        const apiKey = await this.auth.resolveApiKey();
        return {
            model,
            context: normalizeInput(params.input, model, this.resolveSystemPrompt(params.systemPrompt)),
            options: {
                ...params.options,
                apiKey,
            },
        };
    };
    resolveSystemPrompt = (systemPrompt) => {
        if (systemPrompt === undefined) {
            return this.defaultSystemPrompt;
        }
        if (systemPrompt === null) {
            return undefined;
        }
        if (typeof systemPrompt !== "string") {
            throw new Error("Only string systemPrompt is supported. Pass a pi-ai Context for richer system input.");
        }
        return systemPrompt;
    };
}
const assertOk = (msg) => {
    if (msg.stopReason === "error" || msg.stopReason === "aborted") {
        throw new Error(msg.errorMessage ?? `LLM request failed with stopReason="${msg.stopReason}".`);
    }
};
export class CodexClient extends PiOAuthClient {
    constructor(opts = {}) {
        const provider = {
            ...openAICodexProvider,
            login: opts.deps?.loginOpenAICodex ?? openAICodexProvider.login,
        };
        super({
            ...opts,
            provider,
        });
    }
}
