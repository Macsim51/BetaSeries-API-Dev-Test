import assert from "node:assert/strict";
import test from "node:test";
import { cleanParams, createBetaSeriesClient, normalizeApiUrl, normalizeMethod } from "../src/betaseries.js";
import { createConfig } from "../src/config.js";

test("normalizeApiUrl limite strictement les requêtes à BetaSeries", () => {
  assert.equal(normalizeApiUrl("shows/display").toString(), "https://api.betaseries.com/shows/display");
  assert.equal(normalizeApiUrl("https://api.betaseries.com/movies/movie?id=1").pathname, "/movies/movie");
  assert.throws(() => normalizeApiUrl("https://example.com/shows/display"), /Seules les URL/);
  assert.throws(() => normalizeApiUrl("//example.com/shows/display"), /Seules les URL/);
  assert.throws(() => normalizeApiUrl("https://api.betaseries.com/path#fragment"), /Seules les URL/);
});

test("les méthodes et paramètres invalides sont rejetés", () => {
  assert.equal(normalizeMethod("post"), "POST");
  assert.throws(() => normalizeMethod("TRACE"), /non prise en charge/);
  assert.deepEqual(cleanParams({ id: 12, empty: "", tags: ["a", "b"] }), {
    id: "12",
    tags: '["a","b"]'
  });
  assert.throws(() => cleanParams([]), /objet JSON/);
  assert.throws(() => cleanParams({ ["x".repeat(101)]: "value" }), /nom de paramètre/);
});

test("le proxy utilise les secrets sans les réexposer dans ses métadonnées", async () => {
  const config = createConfig({
    BETASERIES_API_KEY: "server-api-key",
    BETASERIES_API_VERSION: "3.0"
  });
  let receivedUrl;
  let receivedOptions;
  const fetchImpl = async (url, options) => {
    receivedUrl = new URL(url);
    receivedOptions = options;
    return new Response(JSON.stringify({ show: { id: 42 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const client = createBetaSeriesClient(config, fetchImpl);

  const result = await client.proxyRequest({
    method: "POST",
    path: "/shows/show?access_token=query-secret",
    bodyMode: "json",
    body: { id: "42", password: "body-secret" },
    credentials: { accessToken: "oauth-secret" }
  });

  assert.equal(receivedUrl.searchParams.get("access_token"), "query-secret");
  assert.equal(receivedOptions.headers["X-BetaSeries-Key"], "server-api-key");
  assert.equal(receivedOptions.headers.Authorization, "Bearer oauth-secret");
  assert.equal(result.payload.response.body.show.id, 42);
  assert.equal(new URL(result.payload.request.url).searchParams.get("access_token"), "[MASQUÉ]");
  assert.equal(result.payload.request.sentBody.password, "[MASQUÉ]");
  assert.doesNotMatch(JSON.stringify(result.payload.request), /query-secret|body-secret|oauth-secret|server-api-key/);
});

test("l’URL OAuth contient un state et utilise le secret uniquement côté serveur", () => {
  const config = createConfig({
    BETASERIES_API_KEY: "client-id",
    BETASERIES_CLIENT_SECRET: "client-secret"
  });
  const client = createBetaSeriesClient(config, async () => new Response());
  const result = client.buildAuthorizeUrl({ state: "state-for-test" });
  const authorizeUrl = new URL(result.authorizeUrl);

  assert.equal(authorizeUrl.origin, "https://www.betaseries.com");
  assert.equal(authorizeUrl.searchParams.get("client_id"), "client-id");
  assert.equal(authorizeUrl.searchParams.get("state"), "state-for-test");
  assert.equal(authorizeUrl.searchParams.has("client_secret"), false);
});
