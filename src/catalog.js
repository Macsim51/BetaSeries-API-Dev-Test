import { inflateSync, unzipSync } from "node:zlib";
import { HttpError } from "./http.js";

export const DOCS_BASE = "https://developers.betaseries.com";
export const DOCS_SITEMAP = `${DOCS_BASE}/sitemap.xml`;

const CACHE_TTL_MS = 60 * 60 * 1_000;
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const MAX_INFLATED_SPEC_BYTES = 2 * 1024 * 1024;

/**
 * Construit un catalogue mis en cache. Une promesse unique évite qu'un rafraîchissement
 * simultané déclenche plusieurs dizaines de requêtes vers la documentation.
 */
export function createEndpointCatalogService({ fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  let cache = null;
  let cacheAt = 0;
  let pendingRefresh = null;

  return Object.freeze({
    async get({ refresh = false } = {}) {
      const cacheIsFresh = cache && Date.now() - cacheAt < CACHE_TTL_MS;
      if (!refresh && cacheIsFresh) return cache;
      if (pendingRefresh) return pendingRefresh;

      pendingRefresh = buildEndpointCatalog(fetchImpl, timeoutMs)
        .then((endpoints) => {
          cache = endpoints;
          cacheAt = Date.now();
          return endpoints;
        })
        .catch((error) => {
          if (cache) return cache;
          throw error;
        })
        .finally(() => {
          pendingRefresh = null;
        });
      return pendingRefresh;
    }
  });
}

async function buildEndpointCatalog(fetchImpl, timeoutMs) {
  const sitemap = await fetchText(DOCS_SITEMAP, fetchImpl, timeoutMs);
  const chunkIndex = await getDocusaurusChunkIndex(fetchImpl, timeoutMs);
  const docsUrls = [...sitemap.matchAll(/<loc>(https:\/\/developers\.betaseries\.com\/docs\/api\/[^<]+)<\/loc>/g)]
    .map((match) => match[1])
    .filter((url) => !url.endsWith("/betaseries-api"))
    .slice(0, 500);

  const pages = await mapWithConcurrency(docsUrls, 10, async (url) => {
    try {
      const endpoint = parseEndpointDoc(url, await fetchText(url, fetchImpl, timeoutMs));
      return endpoint
        ? enrichEndpointFromChunk(endpoint, chunkIndex, fetchImpl, timeoutMs)
        : null;
    } catch (error) {
      console.warn(`Documentation ignorée (${url}) : ${error.message}`);
      return null;
    }
  });

  return pages
    .filter(Boolean)
    .sort((a, b) => a.group.localeCompare(b.group)
      || a.path.localeCompare(b.path)
      || a.method.localeCompare(b.method));
}

async function getDocusaurusChunkIndex(fetchImpl, timeoutMs) {
  const categoryHtml = await fetchText(`${DOCS_BASE}/docs/category/api`, fetchImpl, timeoutMs);
  const scriptSources = [...categoryHtml.matchAll(/<script src="([^"]+)" defer="defer"><\/script>/g)]
    .map((match) => new URL(match[1], DOCS_BASE).toString())
    .filter((url) => new URL(url).origin === DOCS_BASE);
  const runtimeUrl = scriptSources.find((source) => source.includes("runtime~main"));
  const mainUrl = scriptSources.find((source) => source.includes("/main."));
  if (!runtimeUrl || !mainUrl) throw new Error("Ressources Docusaurus introuvables.");

  const [runtime, main] = await Promise.all([
    fetchText(runtimeUrl, fetchImpl, timeoutMs),
    fetchText(mainUrl, fetchImpl, timeoutMs)
  ]);
  const chunkNames = parseRuntimeChunkObject(runtime, 0);
  const chunkHashes = parseRuntimeChunkObject(runtime, 1);
  const docs = new Map();
  const docRegex = /(?:^|,)(?:"?[0-9a-f]{8}"?):\[\(\)=>Promise\.all\(\[([^\]]+?)\]\)\.then\(n\.bind\(n,([A-Za-z0-9]+)\)\),"@site\/docs\/api\/([^"]+?)\.api\.mdx",([A-Za-z0-9]+)\]/g;

  for (const match of main.matchAll(docRegex)) {
    const chunkIds = [...match[1].matchAll(/n\.e\(([^)]+)\)/g)]
      .map((chunkMatch) => normalizeChunkId(chunkMatch[1]))
      .filter((id) => id !== "1869" && id !== "2076");
    const chunkId = chunkIds.at(-1);
    if (!chunkId) continue;

    const chunkName = chunkNames.get(chunkId);
    const chunkHash = chunkHashes.get(chunkId);
    if (!chunkName || !chunkHash || !/^[\w.-]+$/.test(chunkName) || !/^[\w.-]+$/.test(chunkHash)) continue;

    docs.set(match[3], {
      moduleId: match[2],
      chunkId,
      url: `${DOCS_BASE}/assets/js/${chunkName}.${chunkHash}.js`
    });
  }
  return docs;
}

export function parseRuntimeChunkObject(runtime, objectIndex) {
  const marker = runtime.match(/\.[A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*=>["']assets\/js\/["']\+\(/);
  const start = marker?.index ?? -1;
  if (start === -1) return new Map();

  const firstObjectStart = runtime.indexOf("{", start);
  const firstObjectEnd = findMatching(runtime, firstObjectStart, "{", "}");
  const secondObjectStart = runtime.indexOf("{", firstObjectEnd);
  const secondObjectEnd = findMatching(runtime, secondObjectStart, "{", "}");
  if ([firstObjectStart, firstObjectEnd, secondObjectStart, secondObjectEnd].includes(-1)) return new Map();

  const objectText = objectIndex === 0
    ? runtime.slice(firstObjectStart + 1, firstObjectEnd)
    : runtime.slice(secondObjectStart + 1, secondObjectEnd);
  const map = new Map();
  for (const match of objectText.matchAll(/(?:"([^"]+)"|([A-Za-z0-9]+)):"([^"]+)"/g)) {
    map.set(normalizeChunkId(match[1] || match[2]), match[3]);
  }
  return map;
}

async function enrichEndpointFromChunk(endpoint, chunkIndex, fetchImpl, timeoutMs) {
  const slug = endpoint.docsUrl.split("/").filter(Boolean).pop();
  const chunk = chunkIndex.get(slug);
  if (!chunk) return endpointWithoutParameters(endpoint);

  const chunkSource = await fetchText(chunk.url, fetchImpl, timeoutMs);
  const parameters = parseChunkParameters(chunkSource);
  const query = parameters
    .filter((parameter) => ["query", "path"].includes(parameter.location))
    .map(parameterToParamTuple);
  const body = parameters
    .filter((parameter) => !["query", "path", "header", "cookie"].includes(parameter.location))
    .map(parameterToParamTuple);

  return {
    ...endpoint,
    query: addGlobalQueryParams(query),
    body,
    parameters,
    parameterCount: parameters.length
  };
}

function endpointWithoutParameters(endpoint) {
  return {
    ...endpoint,
    query: addGlobalQueryParams(endpoint.query),
    parameters: [],
    parameterCount: 0
  };
}

function addGlobalQueryParams(query) {
  const names = new Set(query.map(([name]) => name));
  const globals = [
    ["fields", "", "Optionnel · query — Limiter les champs retournés, ex. id,title,images.poster"],
    ["excludes", "", "Optionnel · query — Exclure des champs de l’arbre retourné, ex. images,comments"]
  ];
  return [...query, ...globals.filter(([name]) => !names.has(name))];
}

/**
 * Extrait uniquement la spécification compressée et sérialisée en JSON. Aucun code
 * JavaScript provenant du site de documentation n'est évalué.
 */
export function parseChunkParameters(source) {
  const encodedApi = matchFirst(source, /api:"([^"]+)"/);
  if (!encodedApi || encodedApi.length > MAX_INFLATED_SPEC_BYTES * 2) return [];

  for (const inflate of [inflateSync, unzipSync]) {
    try {
      const output = inflate(Buffer.from(encodedApi, "base64"), {
        maxOutputLength: MAX_INFLATED_SPEC_BYTES
      }).toString("utf8");
      const spec = JSON.parse(output);
      return Array.isArray(spec.parameters)
        ? spec.parameters.slice(0, 200).map(normalizeParameter).filter(Boolean)
        : [];
    } catch {
      // Certains builds utilisent zlib et d'autres gzip : on essaie le format suivant.
    }
  }
  return [];
}

function normalizeParameter(parameter) {
  if (!parameter?.name || typeof parameter.name !== "string") return null;
  return {
    name: parameter.name,
    location: parameter.in || "query",
    description: typeof parameter.description === "string" ? parameter.description : "",
    required: Boolean(parameter.required),
    type: parameter.schema?.type || "",
    defaultValue: parameter.schema?.default ?? "",
    enumValues: Array.isArray(parameter.schema?.enum) ? parameter.schema.enum : []
  };
}

function parameterToParamTuple(parameter) {
  const meta = [
    parameter.required ? "Requis" : "Optionnel",
    parameter.location,
    parameter.type
  ].filter(Boolean).join(" · ");
  const details = [meta, parameter.description].filter(Boolean).join(" — ");
  return [
    parameter.name,
    parameter.defaultValue === null || parameter.defaultValue === undefined
      ? ""
      : String(parameter.defaultValue),
    details || "Paramètre documenté"
  ];
}

function findMatching(text, start, openChar, closeChar) {
  if (start < 0) return -1;
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function normalizeChunkId(value) {
  if (/^\d+e\d+$/i.test(value)) return String(Number(value));
  return String(value).replace(/^"|"$/g, "");
}

async function fetchText(url, fetchImpl, timeoutMs) {
  const parsedUrl = new URL(url);
  if (parsedUrl.origin !== DOCS_BASE) throw new Error("Origine de documentation non autorisée.");

  let response;
  try {
    response = await fetchImpl(parsedUrl, {
      headers: {
        Accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "BetaSeriesApiExplorer/1.0"
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new HttpError(502, "Documentation BetaSeries inaccessible.", { cause: error });
  }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const length = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > MAX_DOC_BYTES) {
    await response.body?.cancel();
    throw new Error("Ressource de documentation trop volumineuse.");
  }
  return readLimitedText(response, MAX_DOC_BYTES);
}

async function readLimitedText(response, maximumBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new Error("Ressource de documentation trop volumineuse.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export function parseEndpointDoc(url, html) {
  const endpointMatch = html.match(/<span class="badge[^"]*">([^<]+)<\/span>\s*<h2 class="openapi__method-endpoint-path">([^<]+)<\/h2>/);
  if (!endpointMatch) return null;

  const title = decodeHtml(stripTags(matchFirst(html, /<h1 class="openapi__heading">([\s\S]*?)<\/h1>/) || titleFromUrl(url)));
  const description = decodeHtml(stripTags(matchFirst(html, /<div class="openapi__divider"><\/div>\s*<p>([\s\S]*?)<\/p>/) || ""));
  const method = endpointMatch[1].trim().toUpperCase();
  const path = decodeHtml(endpointMatch[2].trim());
  const group = decodeHtml(stripTags(matchFirst(html, /<li class="breadcrumbs__item"><span class="breadcrumbs__link">([^<]+)<\/span><meta itemprop="position" content="2">/) || groupFromPath(path)));

  return {
    group,
    name: title,
    method,
    path,
    description: description || title,
    auth: /X-BetaSeries-Token|BetaSeriesToken/.test(html),
    query: [],
    body: [],
    docsUrl: url
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

function titleFromUrl(url) {
  return url.split("/").filter(Boolean).pop()
    .replace(/^(get|post|put|delete|patch)-/, "")
    .replaceAll("-", " ");
}

function groupFromPath(path) {
  const firstSegment = path.split("/").filter(Boolean)[0] || "Custom";
  return firstSegment.split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function matchFirst(text, regex) {
  return text.match(regex)?.[1] || "";
}

function stripTags(text) {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(text) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#039;", "'");
}
