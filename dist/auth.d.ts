import type { Deps, OAuthProvider } from "./types.js";
export declare class AuthStore {
    private readonly authPath;
    private readonly deps;
    private readonly provider;
    private authUpdateQueue;
    constructor(authPath: string, deps: Deps, provider: OAuthProvider);
    login: () => Promise<void>;
    ensureLogin: () => Promise<void>;
    resolveApiKey: () => Promise<string>;
    private load;
    private save;
    private loginAndSave;
    static expandPath: (path: string) => string;
    private prompt;
    private enqueueAuthUpdate;
}
