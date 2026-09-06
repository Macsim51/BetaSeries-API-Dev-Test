const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});

export class HttpError extends Error {
  constructor(status, message, options) {
    super(message, options);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Lit un corps JSON en imposant son type et une taille maximale. */
export async function readJson(req, maximumBytes) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Le type Content-Type application/json est requis.");
  }

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new HttpError(413, "Le corps de la requête est trop volumineux.");
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maximumBytes) {
      throw new HttpError(413, "Le corps de la requête est trop volumineux.");
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};

  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HttpError(400, "Le corps JSON doit être un objet.");
    }
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Le corps de la requête contient un JSON invalide.");
  }
}

/** Bloque les requêtes de navigateur provenant d'un autre site. */
export function assertSameOrigin(req, allowedOrigins) {
  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite === "cross-site") {
    throw new HttpError(403, "Les requêtes provenant d’un autre site sont refusées.");
  }

  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    throw new HttpError(403, "Origine non autorisée.");
  }
}

export function sendJson(res, payload, status = 200, headers = {}) {
  const body = JSON.stringify(payload, null, 2);
  writeResponse(res, status, body, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
}

export function sendText(res, payload, status = 200, headers = {}) {
  writeResponse(res, status, payload, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    ...headers
  });
}

export function writeResponse(res, status, body, headers = {}, { head = false } = {}) {
  const encodedBody = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Length": encodedBody.length,
    ...headers
  });
  res.end(head ? undefined : encodedBody);
}

export function publicError(error) {
  if (error instanceof HttpError) {
    return { status: error.status, message: error.message };
  }
  return { status: 500, message: "Une erreur interne inattendue est survenue." };
}
