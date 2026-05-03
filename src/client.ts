import { complete, getModel, stream, type AssistantMessage, type AssistantMessageEventStream, type Model } from "@mariozechner/pi-ai";

import { AuthStore } from "./auth.js";
import { normalizeInput } from "./messages.js";
import { openAICodexProvider } from "./providers.js";
import type {
  CompleteParams,
  ClientOptions,
  OAuthProvider,
  PiOAuthClientOptions,
} from "./types.js";

export class PiOAuthClient {
  private readonly defaultModel?: string;
  private readonly defaultSystemPrompt: string | undefined;
  private readonly auth: AuthStore;
  private readonly provider: OAuthProvider;

  constructor(opts: PiOAuthClientOptions) {
    this.provider = opts.provider;
    this.defaultModel = opts.defaultModel;
    this.defaultSystemPrompt = opts.systemPrompt === undefined ? "" : (opts.systemPrompt ?? undefined);
    this.auth = new AuthStore(AuthStore.expandPath(opts.authPath ?? this.provider.defaultAuthPath), this.provider);
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
      return getModel(this.provider.id as never, id as never);
    } catch {
      throw new Error(`Model "${id}" was not found for provider "${this.provider.id}".`);
    }
  };

  complete = async (params: CompleteParams): Promise<AssistantMessage> => {
    const request = await this.resolveRequest(params);
    const raw = await complete(request.model, request.context, request.options);
    assertOk(raw);
    return raw;
  };

  stream = async (params: CompleteParams): Promise<AssistantMessageEventStream> => {
    const request = await this.resolveRequest(params);
    return stream(request.model, request.context, request.options);
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

    if (systemPrompt === "" || systemPrompt === null) {
      return undefined;
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
  constructor(opts: ClientOptions = {}) {
    super({
      ...opts,
      provider: openAICodexProvider,
    });
  }
}
