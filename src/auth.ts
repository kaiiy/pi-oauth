import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { getOAuthApiKey, type OAuthCredentials, type OAuthPrompt } from "@mariozechner/pi-ai/oauth";

import type { OAuthProvider } from "./types.js";

interface AuthEntry extends OAuthCredentials {
  type: "oauth";
}

type AuthFile = Record<string, AuthEntry | undefined>;

export class AuthStore {
  private authUpdateQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly authPath: string,
    private readonly provider: OAuthProvider,
  ) {}

  login = async (): Promise<void> => {
    await this.loginAndSave(true);
  };

  ensureLogin = async (): Promise<void> => {
    await this.loginAndSave(false);
  };

  resolveApiKey = async (): Promise<string> => {
    return this.enqueueAuthUpdate(async () => {
      const auth = await this.load();
      const credentials = auth[this.provider.id];
      if (!credentials) {
        throw new Error(`${this.provider.displayName} OAuth credentials not found in ${this.authPath}. Call await client.login() first.`);
      }

      const result = await getOAuthApiKey(this.provider.id, {
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

  private load = async (): Promise<AuthFile> => {
    try {
      const text = await readFile(this.authPath, "utf8");
      const auth = JSON.parse(text) as AuthFile;
      return auth && typeof auth === "object" ? auth : {};
    } catch (err) {
      if (isNodeError(err) && err.code === "ENOENT") {
        return {};
      }
      throw err;
    }
  };

  private save = async (auth: AuthFile): Promise<void> => {
    await mkdir(dirname(this.authPath), { recursive: true });
    await writeFile(this.authPath, `${JSON.stringify(auth, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(this.authPath, 0o600);
  };

  private loginAndSave = async (force: boolean): Promise<void> => {
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

  static expandPath = (path: string): string => {
    if (path === "~") {
      return homedir();
    }
    if (path.startsWith("~/")) {
      return resolve(homedir(), path.slice(2));
    }
    return resolve(path);
  };

  private prompt = async (prompt: OAuthPrompt): Promise<string> => {
    const rl = createInterface({ input, output });
    try {
      const suffix = prompt.placeholder ? ` (${prompt.placeholder})` : "";
      return await rl.question(`${prompt.message}${suffix}: `);
    } finally {
      rl.close();
    }
  };

  private enqueueAuthUpdate = async <T>(update: () => Promise<T>): Promise<T> => {
    const queued = this.authUpdateQueue.then(update, update);
    this.authUpdateQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  };
}

const isNodeError = (err: unknown): err is NodeJS.ErrnoException => {
  return err instanceof Error && "code" in err;
};
