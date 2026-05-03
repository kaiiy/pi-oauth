import { complete, getModel, stream, type AssistantMessage, type AssistantMessageEventStream, type Model } from "@mariozechner/pi-ai";
import { getOAuthApiKey } from "@mariozechner/pi-ai/oauth";

import { AuthStore } from "./auth.js";
import { normalizeInput } from "./messages.js";
import { openAICodexProvider } from "./providers.js";
import type {
  CompleteParams,
  CodexClientOptions,
  Deps,
  OAuthProvider,
  PiOAuthClientOptions,
} from "./types.js";

export class PiOAuthClient {
  private readonly defaultModel?: string;
  private readonly defaultSystemPrompt: string | undefined;
  private readonly deps: Deps;
  private readonly auth: AuthStore;
  private readonly provider: OAuthProvider;

  constructor(opts: PiOAuthClientOptions) {
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

  login = async (): Promise<void> => {
    await this.auth.login();
  };

  ensureLogin = async (): Promise<void> => {
    await this.auth.ensureLogin();
  };

  private resolveModel = (model?: string): Model<any> => {
    const id = model ?? this.defaultModel;
    if (!id) {
      throw new Error("No model specified. Pass model in the request or set defaultModel in the constructor.");
    }

    try {
      return this.deps.getModel(this.provider.id as never, id as never);
    } catch {
      throw new Error(`Model "${id}" was not found for provider "${this.provider.id}".`);
    }
  };

  complete = async (params: CompleteParams): Promise<AssistantMessage> => {
    const request = await this.resolveRequest(params);
    const raw = await this.deps.complete(request.model, request.context, request.options);
    assertOk(raw);
    return raw;
  };

  stream = async (params: CompleteParams): Promise<AssistantMessageEventStream> => {
    const request = await this.resolveRequest(params);
    return this.deps.stream(request.model, request.context, request.options);
  };

  private resolveRequest = async (params: CompleteParams) => {
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

  private resolveSystemPrompt = (systemPrompt: CompleteParams["systemPrompt"]): string | undefined => {
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

const assertOk = (msg: AssistantMessage): void => {
  if (msg.stopReason === "error" || msg.stopReason === "aborted") {
    throw new Error(msg.errorMessage ?? `LLM request failed with stopReason="${msg.stopReason}".`);
  }
};

export class CodexClient extends PiOAuthClient {
  constructor(opts: CodexClientOptions = {}) {
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
