import assert from "node:assert/strict";
import test from "node:test";
import { createConfig } from "../src/config.js";

test("createConfig fournit des valeurs locales sûres par défaut", () => {
  const config = createConfig({});

  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 5177);
  assert.equal(config.appOrigin, "http://localhost:5177");
  assert.equal(config.redirectUri, "http://localhost:5177/callback");
  assert.ok(config.allowedOrigins.has("http://127.0.0.1:5177"));
});

test("createConfig refuse les valeurs ambiguës ou dangereuses", () => {
  assert.throws(() => createConfig({ PORT: "0" }), /PORT/);
  assert.throws(() => createConfig({ PORT: "abc" }), /PORT/);
  assert.throws(() => createConfig({ APP_ORIGIN: "javascript:alert(1)" }), /APP_ORIGIN/);
  assert.throws(() => createConfig({ APP_ORIGIN: "https://example.com/path" }), /APP_ORIGIN/);
  assert.throws(() => createConfig({ BETASERIES_API_VERSION: "latest" }), /API_VERSION/);
});
