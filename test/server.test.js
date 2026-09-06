import assert from "node:assert/strict";
import test from "node:test";
import { createAppServer } from "../server.js";
import { createConfig } from "../src/config.js";

async function withServer(callback) {
  const baseConfig = createConfig({
    BETASERIES_API_KEY: "server-secret-key",
    BETASERIES_CLIENT_SECRET: "server-client-secret"
  });
  const server = createAppServer({ config: baseConfig });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("la configuration publique ne contient aucun secret", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/config`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy"), /script-src 'self'/);
    assert.doesNotMatch(body, /server-secret-key|server-client-secret/);
    assert.equal(JSON.parse(body).hasEnvApiKey, true);
  });
});

test("les routes POST imposent JSON et refusent les origines étrangères", async () => {
  await withServer(async (baseUrl) => {
    const wrongType = await fetch(`${baseUrl}/api/request`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}"
    });
    assert.equal(wrongType.status, 415);

    const crossSite = await fetch(`${baseUrl}/api/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com"
      },
      body: "{}"
    });
    assert.equal(crossSite.status, 403);
  });
});

test("les méthodes et ressources inconnues renvoient une erreur explicite", async () => {
  await withServer(async (baseUrl) => {
    const wrongMethod = await fetch(`${baseUrl}/api/config`, { method: "POST" });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "GET");

    const missing = await fetch(`${baseUrl}/does-not-exist.js`);
    assert.equal(missing.status, 404);
  });
});
