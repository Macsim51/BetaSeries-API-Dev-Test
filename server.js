import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createBetaSeriesClient } from "./src/betaseries.js";
import { createEndpointCatalogService, DOCS_SITEMAP } from "./src/catalog.js";
import { API_BASE, createConfig, loadDotEnv, PUBLIC_DIR } from "./src/config.js";
import {
  assertSameOrigin,
  HttpError,
  publicError,
  readJson,
  sendJson,
  sendText,
  writeResponse
} from "./src/http.js";

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
});

/** Crée le serveur avec des dépendances injectables pour les tests d'intégration. */
export function createAppServer({ config = createConfig(), fetchImpl = globalThis.fetch } = {}) {
  const betaSeries = createBetaSeriesClient(config, fetchImpl);
  const catalog = createEndpointCatalogService({ fetchImpl, timeoutMs: config.requestTimeoutMs });

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", config.appOrigin);
      const routeResult = await routeApiRequest(req, res, url, { betaSeries, catalog, config });
      if (routeResult !== false) return;
      await serveStatic(req, res, url);
    } catch (error) {
      const { status, message } = publicError(error);
      if (status >= 500) console.error(error);
      if (!res.headersSent) sendJson(res, { error: message }, status);
      else res.destroy();
    }
  });
}

async function routeApiRequest(req, res, url, services) {
  const { betaSeries, catalog, config } = services;
  const apiRoutes = new Map([
    ["/api/config", "GET"],
    ["/api/endpoints", "GET"],
    ["/api/request", "POST"],
    ["/api/oauth/authorize-url", "POST"],
    ["/api/oauth/access-token", "POST"],
    ["/api/oauth/device", "POST"],
    ["/api/oauth/device-token", "POST"]
  ]);
  const expectedMethod = apiRoutes.get(url.pathname);
  if (!expectedMethod) return false;
  assertSameOrigin(req, config.allowedOrigins);
  if (req.method !== expectedMethod) {
    sendJson(res, { error: "Méthode HTTP non autorisée." }, 405, { Allow: expectedMethod });
    return true;
  }

  if (url.pathname === "/api/config") {
    sendJson(res, {
      apiBase: API_BASE,
      apiVersion: config.apiVersion,
      hasEnvApiKey: Boolean(config.apiKey),
      hasEnvClientSecret: Boolean(config.clientSecret),
      envApiKeyPreview: previewSecret(config.apiKey),
      redirectUri: config.redirectUri
    });
    return true;
  }

  if (url.pathname === "/api/endpoints") {
    const endpoints = await catalog.get({
      refresh: ["1", "true", "yes"].includes(url.searchParams.get("refresh") || "")
    });
    sendJson(res, { source: DOCS_SITEMAP, count: endpoints.length, endpoints });
    return true;
  }

  const payload = await readJson(req, config.maxRequestBytes);
  let result;
  if (url.pathname === "/api/request") result = await betaSeries.proxyRequest(payload);
  if (url.pathname === "/api/oauth/authorize-url") {
    sendJson(res, betaSeries.buildAuthorizeUrl(payload));
    return true;
  }
  if (url.pathname === "/api/oauth/access-token") result = await betaSeries.exchangeOAuthToken(payload);
  if (url.pathname === "/api/oauth/device") result = await betaSeries.startDeviceAuth(payload);
  if (url.pathname === "/api/oauth/device-token") result = await betaSeries.exchangeDeviceToken(payload);

  if (!result) throw new HttpError(404, "Route API introuvable.");
  sendJson(res, result.payload, result.status);
  return true;
}

async function serveStatic(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method || "")) {
    sendText(res, "Méthode non autorisée.", 405, { Allow: "GET, HEAD" });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new HttpError(400, "Le chemin demandé est invalide.");
  }

  const requestedPath = pathname === "/" || pathname === "/callback"
    ? "index.html"
    : pathname.replace(/^\/+/, "");
  const filePath = resolve(PUBLIC_DIR, requestedPath);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${sep}`)) {
    throw new HttpError(403, "Accès interdit.");
  }

  let content;
  try {
    content = await readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") {
      sendText(res, "Ressource introuvable.", 404);
      return;
    }
    throw error;
  }

  const extension = extname(filePath);
  writeResponse(res, 200, content, {
    // Les fichiers n'ont pas de nom versionné : une revalidation évite de servir un front obsolète.
    "Cache-Control": "no-cache",
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
  }, { head: req.method === "HEAD" });
}

function previewSecret(value) {
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

loadDotEnv();

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  const config = createConfig();
  const server = createAppServer({ config });
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Le port ${config.port} est déjà utilisé. Modifiez PORT dans .env ou arrêtez l’autre processus.`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    console.log(`Explorateur API BetaSeries : ${config.appOrigin}`);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
}
