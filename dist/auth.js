import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
export class AuthStore {
    authPath;
    deps;
    provider;
    authUpdateQueue = Promise.resolve();
    constructor(authPath, deps, provider) {
        this.authPath = authPath;
        this.deps = deps;
        this.provider = provider;
    }
    login = async () => {
        await this.loginAndSave(true);
    };
    ensureLogin = async () => {
        await this.loginAndSave(false);
    };
    resolveApiKey = async () => {
        return this.enqueueAuthUpdate(async () => {
            const auth = await this.load();
            const credentials = auth[this.provider.id];
            if (!credentials) {
                throw new Error(`${this.provider.displayName} OAuth credentials not found in ${this.authPath}. Call await client.login() first.`);
            }
            const result = await this.deps.getOAuthApiKey(this.provider.id, {
                [this.provider.id]: credentials,
            });
            if (!result) {
                throw new Error(`${this.provider.displayName} OAuth credentials not found in ${this.authPath}. Call await client.login() first.`);
            }
            auth[this.provider.id] = {
                type: "oauth",
                ...result.newCredentials,
            };
            await this.save(auth);
            return result.apiKey;
        });
    };
    load = async () => {
        try {
            const text = await readFile(this.authPath, "utf8");
            const auth = JSON.parse(text);
            return auth && typeof auth === "object" ? auth : {};
        }
        catch (err) {
            if (isNodeError(err) && err.code === "ENOENT") {
                return {};
            }
            throw err;
        }
    };
    save = async (auth) => {
        await mkdir(dirname(this.authPath), { recursive: true });
        await writeFile(this.authPath, `${JSON.stringify(auth, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
        await chmod(this.authPath, 0o600);
    };
    loginAndSave = async (force) => {
        await this.enqueueAuthUpdate(async () => {
            const auth = await this.load();
            if (!force && auth[this.provider.id]) {
                return;
            }
            auth[this.provider.id] = {
                type: "oauth",
                ...(await this.provider.login({
                    onAuth: ({ url, instructions }) => {
                        output.write(`Open this URL to sign in:\n${url}\n`);
                        if (instructions) {
                            output.write(`${instructions}\n`);
                        }
                    },
                    onPrompt: (prompt) => this.prompt(prompt),
                    onProgress: (msg) => {
                        output.write(`${msg}\n`);
                    },
                })),
            };
            await this.save(auth);
        });
    };
    static expandPath = (path) => {
        if (path === "~") {
            return homedir();
        }
        if (path.startsWith("~/")) {
            return resolve(homedir(), path.slice(2));
        }
        return resolve(path);
    };
    prompt = async (prompt) => {
        const rl = createInterface({ input, output });
        try {
            const suffix = prompt.placeholder ? ` (${prompt.placeholder})` : "";
            return await rl.question(`${prompt.message}${suffix}: `);
        }
        finally {
            rl.close();
        }
    };
    enqueueAuthUpdate = async (update) => {
        const queued = this.authUpdateQueue.then(update, update);
        this.authUpdateQueue = queued.then(() => undefined, () => undefined);
        return queued;
    };
}
const isNodeError = (err) => {
    return err instanceof Error && "code" in err;
};
