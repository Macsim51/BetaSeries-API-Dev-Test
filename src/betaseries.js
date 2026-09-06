import { API_BASE } from "./config.js";
import { HttpError } from "./http.js";

const ALLOWED_METHODS = new Set(["GET", "POST", "DELETE", "PUT", "PATCH"]);
const ALLOWED_BODY_MODES = new Set(["query", "form", "json"]);
const SENSITIVE_PARAMETER = /(authorization|access[_-]?token|client[_-]?secret|password|passwd|api[_-]?key)/i;

/** Construit le client BetaSeries en permettant d'injecter fetch dans les tests. */
export function createBetaSeriesClient(config, fetchImpl = globalThis.fetch) {
  return Object.freeze({
    buildAuthorizeUrl: (payload) => buildAuthorizeUrl(payload, config),
    exchangeDeviceToken: (payload) => exchangeDeviceToken(payload, config, fetchImpl),
    exchangeOAuthToken: (payload) => exchangeOAuthToken(payload, config, fetchImpl),
    proxyRequest: (payload) => proxyRequest(payload, config, fetchImpl),
    startDeviceAuth: (payload) => startDeviceAuth(payload, config, fetchImpl)
  });
}

async function proxyRequest(payload, config, fetchImpl) {
  const method = normalizeMethod(payload.method || "GET");
  const targetUrl = normalizeApiUrl(payload.path);
  const query = cleanParams(payload.query || {});
  const formBody = cleanParams(payload.body || {});
  const bodyMode = normalizeBodyMode(payload.bodyMode || "query");
  const credentials = resolveCredentials(payload.credentials, config);

  if (!credentials.apiKey) {
    throw new HttpError(400, "Une clé API BetaSeries est requise.");
  }

  for (const [key, value] of Object.entries(query)) targetUrl.searchParams.set(key, value);
  if (method !== "GET" && bodyMode === "query") {
    for (const [key, value] of Object.entries(formBody)) targetUrl.searchParams.set(key, value);
  }

  const headers = {
    Accept: "application/json",
    "User-Agent": "BetaSeriesApiExplorer/1.0",
    "X-BetaSeries-Key": credentials.apiKey,
    "X-BetaSeries-Version": config.apiVersion
  };
  if (credentials.accessToken) {
    headers.Authorization = `Bearer ${credentials.accessToken}`;
    headers["X-BetaSeries-Token"] = credentials.accessToken;
  }

  const requestOptions = { method, headers };
  if (method !== "GET" && bodyMode !== "query") {
    if (bodyMode === "json") {
      headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(formBody);
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      requestOptions.body = new URLSearchParams(formBody).toString();
    }
  }

  const startedAt = performance.now();
  const apiResponse = await fetchUpstream(fetchImpl, targetUrl, requestOptions, config.requestTimeoutMs);
  const rawText = await readLimitedResponse(apiResponse, config.maxResponseBytes);
  const durationMs = Math.round(performance.now() - startedAt);
  const parsedBody = parseResponseBody(rawText, apiResponse.headers.get("content-type"));

  return {
    status: apiResponse.status,
    payload: {
      request: {
        method,
        url: redactUrl(targetUrl).toString(),
        bodyMode,
        sentBody: method !== "GET" && bodyMode !== "query" ? redactParams(formBody) : null
      },
      response: {
        ok: apiResponse.ok,
        status: apiResponse.status,
        statusText: apiResponse.statusText,
        contentType: apiResponse.headers.get("content-type"),
        durationMs,
        sizeBytes: Buffer.byteLength(rawText, "utf8"),
        body: parsedBody
      }
    }
  };
}

function buildAuthorizeUrl(payload, config) {
  const credentials = resolveCredentials(payload.credentials, config);
  if (!credentials.apiKey) throw new HttpError(400, "Une clé API BetaSeries est requise.");

  const state = requireShortString(payload.state, "Le paramètre OAuth state est requis.", 256);
  const authorizeUrl = new URL("https://www.betaseries.com/authorize");
  authorizeUrl.searchParams.set("client_id", credentials.apiKey);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("state", state);
  return { authorizeUrl: authorizeUrl.toString() };
}

async function exchangeOAuthToken(payload, config, fetchImpl) {
  const credentials = requireOAuthCredentials(payload.credentials, config);
  const code = requireShortString(payload.code, "Le code OAuth est requis.", 2_048);
  return postOAuth("/oauth/access_token", {
    client_id: credentials.apiKey,
    client_secret: credentials.clientSecret,
    redirect_uri: config.redirectUri,
    code
  }, config, fetchImpl);
}

async function startDeviceAuth(payload, config, fetchImpl) {
  const credentials = requireOAuthCredentials(payload.credentials, config);
  return postOAuth("/oauth/device", {
    client_id: credentials.apiKey,
    client_secret: credentials.clientSecret
  }, config, fetchImpl);
}

async function exchangeDeviceToken(payload, config, fetchImpl) {
  const credentials = requireOAuthCredentials(payload.credentials, config);
  const code = requireShortString(payload.deviceCode, "Le code appareil est requis.", 2_048);
  return postOAuth("/oauth/access_token", {
    client_id: credentials.apiKey,
    client_secret: credentials.clientSecret,
    code
  }, config, fetchImpl);
}

async function postOAuth(path, params, config, fetchImpl) {
  const startedAt = performance.now();
  const apiResponse = await fetchUpstream(fetchImpl, `${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "BetaSeriesApiExplorer/1.0",
      "X-BetaSeries-Key": params.client_id,
      "X-BetaSeries-Version": config.apiVersion
    },
    body: new URLSearchParams(params).toString()
  }, config.requestTimeoutMs);

  const rawText = await readLimitedResponse(apiResponse, config.maxResponseBytes);
  const parsedBody = parseResponseBody(rawText, apiResponse.headers.get("content-type"));
  return {
    status: apiResponse.status,
    payload: {
      ok: apiResponse.ok,
      status: apiResponse.status,
      statusText: apiResponse.statusText,
      contentType: apiResponse.headers.get("content-type"),
      durationMs: Math.round(performance.now() - startedAt),
      sizeBytes: Buffer.byteLength(rawText, "utf8"),
      body: parsedBody,
      accessToken: extractAccessToken(parsedBody, rawText)
    }
  };
}

async function fetchUpstream(fetchImpl, url, options, timeoutMs) {
  try {
    return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new HttpError(504, "BetaSeries n’a pas répondu dans le délai prévu.", { cause: error });
    }
    throw new HttpError(502, "Impossible de joindre BetaSeries.", { cause: error });
  }
}

/** Lit une réponse en flux afin d'éviter qu'une réponse anormale épuise la mémoire. */
async function readLimitedResponse(response, maximumBytes) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel();
    throw new HttpError(502, "La réponse BetaSeries est trop volumineuse.");
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new HttpError(502, "La réponse BetaSeries est trop volumineuse.");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export function normalizeApiUrl(path) {
  if (typeof path !== "string" || !path.trim()) {
    throw new HttpError(400, "Le chemin de l’API est requis.");
  }

  const trimmed = path.trim();
  let url;
  try {
    url = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, API_BASE);
  } catch {
    throw new HttpError(400, "Le chemin de l’API est invalide.");
  }

  if (url.origin !== API_BASE || url.username || url.password || url.hash) {
    throw new HttpError(400, `Seules les URL ${API_BASE} sont autorisées.`);
  }
  return url;
}

export function normalizeMethod(method) {
  const normalized = String(method).toUpperCase();
  if (!ALLOWED_METHODS.has(normalized)) {
    throw new HttpError(400, `Méthode HTTP non prise en charge : ${method}`);
  }
  return normalized;
}

function normalizeBodyMode(mode) {
  if (!ALLOWED_BODY_MODES.has(mode)) {
    throw new HttpError(400, `Mode de corps non pris en charge : ${mode}`);
  }
  return mode;
}

export function cleanParams(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new HttpError(400, "Les paramètres doivent être un objet JSON.");
  }
  const entries = Object.entries(params);
  if (entries.length > 100) throw new HttpError(400, "La requête contient trop de paramètres.");

  return Object.fromEntries(entries
    .map(([key, value]) => [key.trim(), normalizeParamValue(value)])
    .filter(([key, value]) => key && value !== "")
    .map(([key, value]) => {
      if (key.length > 100 || /[\r\n\0]/.test(key)) {
        throw new HttpError(400, "Un nom de paramètre est invalide.");
      }
      if (value.length > 10_000) throw new HttpError(400, `Le paramètre ${key} est trop long.`);
      return [key, value];
    }));
}

function normalizeParamValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function resolveCredentials(credentials, config) {
  const supplied = credentials && typeof credentials === "object" && !Array.isArray(credentials)
    ? credentials
    : {};
  return {
    apiKey: normalizeCredential(supplied.apiKey) || config.apiKey,
    clientSecret: normalizeCredential(supplied.clientSecret) || config.clientSecret,
    accessToken: normalizeCredential(supplied.accessToken)
  };
}

function normalizeCredential(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized.length > 4_096 || /[\r\n\0]/.test(normalized)) {
    throw new HttpError(400, "Un identifiant fourni est invalide.");
  }
  return normalized;
}

function requireOAuthCredentials(credentials, config) {
  const resolved = resolveCredentials(credentials, config);
  if (!resolved.apiKey || !resolved.clientSecret) {
    throw new HttpError(400, "La clé API et le client secret OAuth sont requis.");
  }
  return resolved;
}

function requireShortString(value, errorMessage, maximumLength) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, errorMessage);
  const normalized = value.trim();
  if (normalized.length > maximumLength || /[\r\n\0]/.test(normalized)) {
    throw new HttpError(400, "La valeur fournie est invalide.");
  }
  return normalized;
}

function parseResponseBody(text, contentType = "") {
  if (!text) return null;
  if (contentType?.includes("application/json")) {
    try { return JSON.parse(text); } catch { return text; }
  }
  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    return [...params.keys()].length > 0 ? Object.fromEntries(params.entries()) : text;
  }
}

function extractAccessToken(parsedBody, rawText) {
  if (parsedBody && typeof parsedBody === "object") {
    return parsedBody.access_token || parsedBody.token || parsedBody.accessToken || "";
  }
  return new URLSearchParams(rawText).get("access_token") || "";
}

function redactUrl(input) {
  const url = new URL(input);
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_PARAMETER.test(key)) url.searchParams.set(key, "[MASQUÉ]");
  }
  return url;
}

function redactParams(params) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [
    key,
    SENSITIVE_PARAMETER.test(key) ? "[MASQUÉ]" : value
  ]));
}
