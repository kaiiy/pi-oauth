import type { Context, Model } from "@mariozechner/pi-ai";
import type { ClientInput } from "./types.js";
declare const normalizeInput: (input: ClientInput, model: Model<any>, defaultSystemPrompt: string | undefined) => Context;
export { normalizeInput };
