import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_DIR = resolve(ROOT_DIR, "public");
export const API_BASE = "https://api.betaseries.com";

/** Charge un fichier .env minimal sans écraser les variables déjà définies. */
export function loadDotEnv(env = process.env, filePath = resolve(ROOT_DIR, ".env")) {
  if (!existsSync(filePath)) return;

  const contents = readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (env[key] !== undefined) continue;
    env[key] = unquoteEnvValue(rawValue.trim());
  }
}

/** Valide et normalise toute la configuration au démarrage. */
export function createConfig(env = process.env) {
  const port = parseInteger(env.PORT, 5177, { minimum: 1, maximum: 65_535, name: "PORT" });
  const host = env.HOST?.trim() || "127.0.0.1";
  const appOrigin = normalizeOrigin(env.APP_ORIGIN || `http://localhost:${port}`, "APP_ORIGIN");
  const redirectUri = normalizeHttpUrl(
    env.BETASERIES_REDIRECT_URI || `${appOrigin}/callback`,
    "BETASERIES_REDIRECT_URI"
  );
  const apiVersion = env.BETASERIES_API_VERSION?.trim() || "3.0";

  if (!/^\d+(?:\.\d+)?$/.test(apiVersion)) {
    throw new Error("BETASERIES_API_VERSION doit être un numéro de version valide.");
  }

  const allowedOrigins = new Set([
    appOrigin,
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://[::1]:${port}`
  ]);

  return Object.freeze({
    port,
    host,
    appOrigin,
    redirectUri,
    allowedOrigins,
    apiVersion,
    apiKey: env.BETASERIES_API_KEY?.trim() || "",
    clientSecret: env.BETASERIES_CLIENT_SECRET?.trim() || "",
    requestTimeoutMs: parseInteger(env.REQUEST_TIMEOUT_MS, 15_000, {
      minimum: 1_000,
      maximum: 120_000,
      name: "REQUEST_TIMEOUT_MS"
    }),
    maxRequestBytes: parseInteger(env.MAX_REQUEST_BYTES, 64 * 1024, {
      minimum: 1_024,
      maximum: 1024 * 1024,
      name: "MAX_REQUEST_BYTES"
    }),
    maxResponseBytes: parseInteger(env.MAX_RESPONSE_BYTES, 5 * 1024 * 1024, {
      minimum: 64 * 1024,
      maximum: 20 * 1024 * 1024,
      name: "MAX_RESPONSE_BYTES"
    })
  });
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseInteger(value, fallback, { minimum, maximum, name }) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} doit être un entier compris entre ${minimum} et ${maximum}.`);
  }
  return parsed;
}

function normalizeOrigin(value, name) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${name} doit être une origine HTTP(S) valide.`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} ne doit contenir ni chemin, ni paramètres, ni fragment.`);
  }
  return url.origin;
}

function normalizeHttpUrl(value, name) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error(`${name} doit être une URL HTTP(S) valide sans identifiants ni fragment.`);
  }
  return url.toString();
}
