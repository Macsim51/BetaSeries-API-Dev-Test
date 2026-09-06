import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { parseChunkParameters, parseEndpointDoc } from "../src/catalog.js";

test("parseChunkParameters décompresse uniquement une spécification JSON", () => {
  const specification = {
    parameters: [{
      name: "id",
      in: "query",
      required: true,
      description: "Identifiant",
      schema: { type: "integer", default: 1 }
    }]
  };
  const encoded = deflateSync(JSON.stringify(specification)).toString("base64");
  const parameters = parseChunkParameters(`prefix api:"${encoded}" suffix`);

  assert.deepEqual(parameters, [{
    name: "id",
    location: "query",
    description: "Identifiant",
    required: true,
    type: "integer",
    defaultValue: 1,
    enumValues: []
  }]);
});

test("parseChunkParameters n’évalue jamais du JavaScript distant", () => {
  globalThis.__betaSeriesCatalogTest = false;
  const parameters = parseChunkParameters(
    "parameters:[(()=>{globalThis.__betaSeriesCatalogTest=true;return {name:'id'}})()]"
  );

  assert.deepEqual(parameters, []);
  assert.equal(globalThis.__betaSeriesCatalogTest, false);
  delete globalThis.__betaSeriesCatalogTest;
});

test("parseEndpointDoc extrait les métadonnées utiles", () => {
  const html = `
    <li class="breadcrumbs__item"><span class="breadcrumbs__link">Shows</span><meta itemprop="position" content="2">
    <h1 class="openapi__heading">Afficher une série</h1>
    <span class="badge badge--primary">get</span><h2 class="openapi__method-endpoint-path">/shows/display</h2>
    <div class="openapi__divider"></div><p>Détails &amp; images.</p>
  `;
  const endpoint = parseEndpointDoc("https://developers.betaseries.com/docs/api/get-shows-display", html);

  assert.equal(endpoint.method, "GET");
  assert.equal(endpoint.path, "/shows/display");
  assert.equal(endpoint.group, "Shows");
  assert.equal(endpoint.description, "Détails & images.");
});
