import { DEFAULT_ENDPOINTS } from "./endpoints.js";

let ENDPOINTS = structuredClone(DEFAULT_ENDPOINTS);
const state = {
  config: null,
  selectedIndex: 0,
  activeParamTarget: "query",
  activeResultView: "json",
  lastResult: null,
  history: readSessionHistory(),
  deviceCode: "",
  resultMaximized: false
};

const $ = (selector) => document.querySelector(selector);

const els = {
  authStatus: $("#authStatus"),
  apiKeyInput: $("#apiKeyInput"),
  clientSecretInput: $("#clientSecretInput"),
  tokenInput: $("#tokenInput"),
  saveCredentialsBtn: $("#saveCredentialsBtn"),
  clearCredentialsBtn: $("#clearCredentialsBtn"),
  startOAuthBtn: $("#startOAuthBtn"),
  startDeviceBtn: $("#startDeviceBtn"),
  deviceBox: $("#deviceBox"),
  deviceCode: $("#deviceCode"),
  deviceLink: $("#deviceLink"),
  pollDeviceBtn: $("#pollDeviceBtn"),
  endpointSearch: $("#endpointSearch"),
  endpointList: $("#endpointList"),
  methodSelect: $("#methodSelect"),
  pathInput: $("#pathInput"),
  endpointMeta: $("#endpointMeta"),
  queryTab: $("#queryTab"),
  bodyTab: $("#bodyTab"),
  queryParams: $("#queryParams"),
  bodyParams: $("#bodyParams"),
  bodyEmptyState: $("#bodyEmptyState"),
  bodyModeRow: $("#bodyModeRow"),
  addParamBtn: $("#addParamBtn"),
  copyCurlBtn: $("#copyCurlBtn"),
  sendBtn: $("#sendBtn"),
  responseTitle: $("#responseTitle"),
  responseStats: $("#responseStats"),
  maximizeResultBtn: $("#maximizeResultBtn"),
  jsonViewBtn: $("#jsonViewBtn"),
  treeViewBtn: $("#treeViewBtn"),
  historyViewBtn: $("#historyViewBtn"),
  jsonView: $("#jsonView"),
  treeView: $("#treeView"),
  historyView: $("#historyView"),
  jsonOutput: $("#jsonOutput"),
  treeSummary: $("#treeSummary"),
  treeOutput: $("#treeOutput"),
  historyOutput: $("#historyOutput"),
  toast: $("#toast")
};

const MAX_RENDER_DEPTH = 40;
const MAX_RENDER_ENTRIES = 250;
const SENSITIVE_PARAMETER = /(authorization|access[_-]?token|client[_-]?secret|password|passwd|api[_-]?key)/i;

init().catch((error) => {
  console.error(error);
  showToast("Impossible d’initialiser l’application.");
});

async function init() {
  bindEvents();
  loadLocalCredentials();
  await loadServerConfig();
  handleOAuthCallback();
  renderEndpointList();
  selectEndpoint(0);
  renderHistory();
  const initialSignature = `${els.methodSelect.value} ${els.pathInput.value}`;
  await loadEndpointCatalog();
  const matchingIndex = ENDPOINTS.findIndex(
    (endpoint) => `${endpoint.method} ${endpoint.path}` === initialSignature
  );
  selectEndpoint(matchingIndex >= 0 ? matchingIndex : 0);
}

async function loadEndpointCatalog() {
  try {
    const response = await fetch("/api/endpoints");
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.endpoints) || data.endpoints.length === 0) {
      throw new Error(data.error || "Catalogue distant indisponible");
    }

    ENDPOINTS = mergeEndpointCatalog(data.endpoints, ENDPOINTS);
    showToast(`${data.endpoints.length} endpoints charges depuis la doc.`);
  } catch (error) {
    console.warn(error);
    showToast("Catalogue local utilise, doc distante indisponible.");
  }
}

function mergeEndpointCatalog(remoteEndpoints, localHints) {
  const hintsBySignature = new Map(localHints.map((endpoint) => [`${endpoint.method} ${endpoint.path}`, endpoint]));

  return remoteEndpoints.map((endpoint) => {
    const hint = hintsBySignature.get(`${endpoint.method} ${endpoint.path}`);
    return {
      ...endpoint,
      auth: hint?.auth ?? endpoint.auth ?? inferAuth(endpoint),
      query: endpoint.query?.length ? endpoint.query : hint?.query ?? defaultQueryParams(endpoint),
      body: Array.isArray(endpoint.body) ? endpoint.body : hint?.body ?? defaultBodyParams(endpoint)
    };
  });
}

function inferAuth(endpoint) {
  const text = `${endpoint.name} ${endpoint.description}`.toLowerCase();
  if (endpoint.group === "Authentication") return false;
  if (endpoint.method !== "GET") return true;
  return /(member|identified|connected|friend|account|profile|notification|message|token|avatar|banner|email|password)/.test(text);
}

function defaultQueryParams(endpoint) {
  const params = [];
  if (endpoint.method === "GET") {
    if (/(display|details|information|movie|episode|series|season|person|badge|poll|event|collection|comment)/i.test(endpoint.name)) {
      params.push(["id", "", "ID si requis par l'endpoint"]);
    }
    if (/(list|search|discover|timeline|planning|comments|subtitles|platforms)/i.test(endpoint.name)) {
      params.push(["limit", "", "Optionnel"]);
      params.push(["offset", "", "Optionnel"]);
    }
    if (/search/i.test(endpoint.name) || /search/i.test(endpoint.path)) {
      params.push(["query", "", "Texte recherche"]);
    }
  }
  params.push(["fields", "", "Limiter les champs retournes"]);
  params.push(["excludes", "", "Exclure des champs retournes"]);
  return dedupeParams(params);
}

function defaultBodyParams(endpoint) {
  if (endpoint.method === "GET") return [];
  const params = [["id", "", "ID si requis par l'endpoint"]];
  if (/note|rate|rating/i.test(endpoint.name)) params.push(["note", "", "Note"]);
  if (/comment/i.test(endpoint.path)) params.push(["text", "", "Texte"]);
  if (/message/i.test(endpoint.path)) params.push(["text", "", "Message"]);
  return dedupeParams(params);
}

function dedupeParams(params) {
  const seen = new Set();
  return params.filter(([key]) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function bindEvents() {
  els.endpointSearch.addEventListener("input", renderEndpointList);
  els.saveCredentialsBtn.addEventListener("click", saveLocalCredentials);
  els.clearCredentialsBtn.addEventListener("click", clearLocalCredentials);
  [els.apiKeyInput, els.clientSecretInput, els.tokenInput].forEach((input) => {
    input.addEventListener("input", updateAuthStatus);
  });
  els.startOAuthBtn.addEventListener("click", () => runUiAction(startOAuth));
  els.startDeviceBtn.addEventListener("click", () => runUiAction(startDeviceAuth));
  els.pollDeviceBtn.addEventListener("click", () => runUiAction(pollDeviceAuth));
  els.queryTab.addEventListener("click", () => setParamTarget("query"));
  els.bodyTab.addEventListener("click", () => setParamTarget("body"));
  els.addParamBtn.addEventListener("click", () => addParamRow(state.activeParamTarget, "", "", "Libre"));
  els.sendBtn.addEventListener("click", sendCurrentRequest);
  els.copyCurlBtn.addEventListener("click", () => runUiAction(copyCurl));
  els.maximizeResultBtn.addEventListener("click", toggleResultMaximized);
  els.jsonViewBtn.addEventListener("click", () => setResultView("json"));
  els.treeViewBtn.addEventListener("click", () => setResultView("tree"));
  els.historyViewBtn.addEventListener("click", () => setResultView("history"));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.resultMaximized) {
      toggleResultMaximized(false);
    }
  });

  els.methodSelect.addEventListener("change", () => {
    const isGet = els.methodSelect.value === "GET";
    if (isGet) {
      document.querySelector('input[name="bodyMode"][value="query"]').checked = true;
    }
    syncParameterControls("query");
  });
}

async function loadServerConfig() {
  const response = await fetch("/api/config");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Configuration serveur indisponible.");
  state.config = data;
  if (data.hasEnvApiKey && !els.apiKeyInput.value) {
    els.apiKeyInput.placeholder = `Définie dans .env (${data.envApiKeyPreview || "masquée"})`;
  }
  updateAuthStatus();
}

function loadLocalCredentials() {
  els.apiKeyInput.value = sessionStorage.getItem("bs.apiKey") || "";
  els.clientSecretInput.value = sessionStorage.getItem("bs.clientSecret") || "";
  els.tokenInput.value = sessionStorage.getItem("bs.accessToken") || "";
}

function saveLocalCredentials() {
  sessionStorage.setItem("bs.apiKey", els.apiKeyInput.value.trim());
  sessionStorage.setItem("bs.clientSecret", els.clientSecretInput.value.trim());
  sessionStorage.setItem("bs.accessToken", els.tokenInput.value.trim());
  updateAuthStatus();
  showToast("Identifiants conservés pour cet onglet uniquement.");
}

function clearLocalCredentials() {
  ["bs.apiKey", "bs.clientSecret", "bs.accessToken"].forEach((key) => sessionStorage.removeItem(key));
  els.apiKeyInput.value = "";
  els.clientSecretInput.value = "";
  els.tokenInput.value = "";
  updateAuthStatus();
  showToast("Identifiants de session effacés.");
}

function updateAuthStatus() {
  const credentials = getCredentials();
  const hasApiKey = Boolean(credentials.apiKey || state.config?.hasEnvApiKey);
  const hasClientSecret = Boolean(credentials.clientSecret || state.config?.hasEnvClientSecret);
  const hasAccessToken = Boolean(credentials.accessToken);

  let label = "À configurer";
  let variant = "warning";

  if (hasApiKey && hasAccessToken) {
    label = "Connecté";
    variant = "ready";
  } else if (hasApiKey && hasClientSecret) {
    label = "OAuth prêt";
    variant = "neutral";
  } else if (hasApiKey) {
    label = "Clé API seule";
  } else if (hasAccessToken || hasClientSecret) {
    label = "Clé API requise";
  }

  els.authStatus.textContent = label;
  els.authStatus.classList.toggle("ready", variant === "ready");
  els.authStatus.classList.toggle("warning", variant === "warning");
}

function handleOAuthCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  if (!code && !oauthError) return;

  const expectedState = sessionStorage.getItem("bs.oauthState");
  const receivedState = url.searchParams.get("state");
  sessionStorage.removeItem("bs.oauthState");
  window.history.replaceState({}, "", "/");

  if (oauthError) {
    showToast(`Autorisation refusée : ${oauthError}`);
    return;
  }
  if (!expectedState || receivedState !== expectedState) {
    showToast("Réponse OAuth refusée : état de sécurité invalide.");
    return;
  }

  exchangeOAuthCode(code)
    .catch((error) => showToast(error.message));
}

async function startOAuth() {
  const credentials = getCredentials();
  if (!credentials.apiKey && !state.config?.hasEnvApiKey) {
    showToast("Ajoute une API key avant OAuth.");
    return;
  }

  const oauthState = crypto.randomUUID();
  const response = await fetch("/api/oauth/authorize-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: oauthState, credentials })
  });
  const data = await response.json();
  if (!response.ok || !data.authorizeUrl) {
    showToast(data.error || "Impossible de démarrer OAuth.");
    return;
  }

  sessionStorage.setItem("bs.oauthState", oauthState);
  window.location.assign(data.authorizeUrl);
}

async function exchangeOAuthCode(code) {
  showToast("Code OAuth recu, recuperation du token...");
  const response = await fetch("/api/oauth/access-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      credentials: getCredentials()
    })
  });
  const data = await response.json();
  if (!data.accessToken) {
    throw new Error(data.error || `Token introuvable (${data.status || response.status})`);
  }
  els.tokenInput.value = data.accessToken;
  sessionStorage.setItem("bs.accessToken", data.accessToken);
  updateAuthStatus();
  showToast("Token OAuth ajoute.");
}

async function startDeviceAuth() {
  const response = await fetch("/api/oauth/device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentials: getCredentials() })
  });
  const data = await response.json();
  const body = data.body || {};

  if (!response.ok || data.error || !body.device_code) {
    showToast(data.error || "Impossible de demarrer OAuth appareil.");
    renderRawResponse(data);
    return;
  }

  state.deviceCode = body.device_code;
  els.deviceCode.textContent = body.user_code || body.code || "(voir JSON)";
  els.deviceLink.href = body.verification_url || "https://www.betaseries.com/device";
  els.deviceBox.classList.remove("hidden");
  renderRawResponse(data);
  showToast("Code appareil cree. Valide-le puis verifie le token.");
}

async function pollDeviceAuth() {
  if (!state.deviceCode) {
    showToast("Demarre d'abord OAuth appareil.");
    return;
  }

  const response = await fetch("/api/oauth/device-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceCode: state.deviceCode,
      credentials: getCredentials()
    })
  });
  const data = await response.json();
  renderRawResponse(data);

  if (data.accessToken) {
    els.tokenInput.value = data.accessToken;
    sessionStorage.setItem("bs.accessToken", data.accessToken);
    updateAuthStatus();
    showToast("Token appareil ajoute.");
  } else {
    showToast(data.error || "Token pas encore disponible.");
  }
}

function renderEndpointList() {
  const term = els.endpointSearch.value.trim().toLowerCase();
  const matching = ENDPOINTS
    .map((endpoint, index) => ({ endpoint, index }))
    .filter(({ endpoint }) => {
      const haystack = `${endpoint.method} ${endpoint.group} ${endpoint.name} ${endpoint.path} ${endpoint.description}`.toLowerCase();
      return !term || haystack.includes(term);
    });

  els.endpointList.innerHTML = "";
  if (matching.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "endpoint-empty-state";
    emptyState.textContent = "Aucun endpoint ne correspond à cette recherche.";
    els.endpointList.appendChild(emptyState);
    return;
  }
  for (const { endpoint, index } of matching) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `endpoint-item ${index === state.selectedIndex ? "selected" : ""}`;
    button.innerHTML = `
      <div class="endpoint-name">
        <span class="method-pill ${endpoint.method.toLowerCase()}">${endpoint.method}</span>
        <strong>${escapeHtml(endpoint.path)}</strong>
      </div>
      <div class="endpoint-desc">${escapeHtml(endpoint.group)} - ${escapeHtml(endpoint.name)}</div>
    `;
    button.addEventListener("click", () => selectEndpoint(index));
    els.endpointList.appendChild(button);
  }
}

function selectEndpoint(index) {
  state.selectedIndex = index;
  const endpoint = ENDPOINTS[index];
  els.methodSelect.value = endpoint.method;
  els.pathInput.value = endpoint.path;
  const docsUrl = trustedDocsUrl(endpoint.docsUrl);
  els.endpointMeta.innerHTML = `
    <div>
      <span class="auth-pill ${endpoint.auth ? "private" : "public"}">${endpoint.auth ? "Token requis" : "Public"}</span>
      <strong>${escapeHtml(endpoint.name)}</strong>
      <span>${escapeHtml(endpoint.description)}</span>
      ${docsUrl ? `<a href="${escapeAttribute(docsUrl)}" target="_blank" rel="noreferrer">Doc</a>` : ""}
    </div>
    <p class="endpoint-note">Les filtres globaux <strong>fields</strong> et <strong>excludes</strong> sont ajoutes pour faciliter les tests, mais ils ne sont pas supportés par tous les endpoints.</p>
  `;

  els.queryParams.innerHTML = "";
  els.bodyParams.innerHTML = "";
  for (const [key, value, hint] of endpoint.query || []) addParamRow("query", key, value, hint);
  if (!(endpoint.query || []).some(([key]) => key === "fields")) {
    addParamRow("query", "fields", "", "Limiter les champs retournes");
  }
  if (!(endpoint.query || []).some(([key]) => key === "excludes")) {
    addParamRow("query", "excludes", "", "Exclure des champs retournes");
  }
  for (const [key, value, hint] of endpoint.body || []) addParamRow("body", key, value, hint);
  const preferredTarget = endpoint.method !== "GET" && (endpoint.body || []).length ? "body" : "query";
  syncParameterControls(preferredTarget);
  renderEndpointList();
}

function setParamTarget(target) {
  const resolvedTarget = target === "body" && !supportsRequestBody() ? "query" : target;
  state.activeParamTarget = resolvedTarget;
  els.queryTab.classList.toggle("active", resolvedTarget === "query");
  els.bodyTab.classList.toggle("active", resolvedTarget === "body");
  els.queryTab.setAttribute("aria-selected", String(resolvedTarget === "query"));
  els.bodyTab.setAttribute("aria-selected", String(resolvedTarget === "body"));
  els.queryParams.classList.toggle("hidden", resolvedTarget !== "query");
  els.bodyParams.classList.toggle("hidden", resolvedTarget !== "body");
  els.bodyModeRow.classList.toggle("hidden", resolvedTarget !== "body");
  els.addParamBtn.textContent = resolvedTarget === "body"
    ? "Ajouter un paramètre Body"
    : "Ajouter un paramètre Query";
  updateBodyEmptyState();
}

function syncParameterControls(preferredTarget = state.activeParamTarget) {
  const bodySupported = supportsRequestBody();
  els.bodyTab.disabled = !bodySupported;
  els.bodyTab.title = bodySupported ? "" : "Les requêtes GET n’envoient pas de Body";
  setParamTarget(bodySupported ? preferredTarget : "query");
}

function supportsRequestBody() {
  return !["GET", "HEAD"].includes(els.methodSelect.value);
}

function updateBodyEmptyState() {
  const isEmpty = !els.bodyParams.querySelector(".param-row");
  els.bodyEmptyState.classList.toggle("hidden", state.activeParamTarget !== "body" || !isEmpty);
}

function addParamRow(target, key = "", value = "", hint = "") {
  const normalized = normalizeParamInput(key, value, hint);
  const container = target === "body" ? els.bodyParams : els.queryParams;
  const row = document.createElement("div");
  row.className = "param-row";
  row.innerHTML = `
    <div class="param-key-wrap">
      <input class="param-key" type="text" spellcheck="false" value="${escapeAttribute(normalized.key)}" placeholder="nom" />
      <span class="param-hint" title="${escapeAttribute(normalized.hint)}">${escapeHtml(normalized.hint || "Parametre")}</span>
    </div>
    <input class="param-value" type="text" spellcheck="false" value="${escapeAttribute(normalized.value)}" placeholder="valeur" />
    <button class="remove-param secondary" type="button" title="Retirer">x</button>
  `;
  row.querySelector(".remove-param").addEventListener("click", () => {
    row.remove();
    updateBodyEmptyState();
  });
  container.appendChild(row);
  updateBodyEmptyState();
}

function normalizeParamInput(key, value, hint) {
  if (Array.isArray(key)) {
    return {
      key: key[0] ?? "",
      value: key[1] ?? "",
      hint: key[2] ?? "Parametre"
    };
  }
  if (key && typeof key === "object") {
    return {
      key: key.name ?? key.key ?? "",
      value: key.defaultValue ?? key.value ?? "",
      hint: key.hint ?? key.description ?? "Parametre"
    };
  }
  return { key, value, hint };
}

async function sendCurrentRequest() {
  const payload = buildPayload();
  if (payload.method !== "GET") {
    const confirmed = window.confirm(
      `Confirmer la requête ${payload.method} ${payload.path} ?\n\nElle peut modifier ou supprimer des données sur le compte BetaSeries connecté.`
    );
    if (!confirmed) {
      showToast("Requête annulée.");
      return;
    }
  }
  els.sendBtn.disabled = true;
  els.sendBtn.textContent = "Envoi...";

  try {
    const response = await fetch("/api/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    state.lastResult = data;
    if (data.response) {
      renderApiResponse(data);
      pushHistory(payload, data);
      showToast(data.response.ok ? "Requête terminée." : "La requête BetaSeries a retourné une erreur.");
    } else {
      renderRawResponse(data);
      showToast(data.error || "La requête n’a pas pu être envoyée.");
    }
  } catch (error) {
    renderRawResponse({ error: error.message });
    showToast(error.message);
  } finally {
    els.sendBtn.disabled = false;
    els.sendBtn.textContent = "Envoyer";
  }
}

function buildPayload() {
  const bodyMode = document.querySelector('input[name="bodyMode"]:checked')?.value || "query";
  return {
    method: els.methodSelect.value,
    path: els.pathInput.value.trim(),
    query: collectParams(els.queryParams),
    body: collectParams(els.bodyParams),
    bodyMode,
    credentials: getCredentials()
  };
}

function getCredentials() {
  return {
    apiKey: els.apiKeyInput.value.trim(),
    clientSecret: els.clientSecretInput.value.trim(),
    accessToken: els.tokenInput.value.trim()
  };
}

function collectParams(container) {
  const params = {};
  for (const row of container.querySelectorAll(".param-row")) {
    const key = row.querySelector(".param-key").value.trim();
    const value = row.querySelector(".param-value").value.trim();
    if (key && value !== "") params[key] = value;
  }
  return params;
}

function renderApiResponse(data) {
  const response = data.response || {};
  const body = response.body ?? data.body ?? data;
  const ok = response.ok === true;
  els.responseTitle.textContent = `${data.request?.method || ""} ${data.request?.url || ""}`;
  els.responseStats.innerHTML = [
    statPill(`${response.status || "?"} ${response.statusText || ""}`, ok ? "public" : "private"),
    statPill(`${response.durationMs ?? "?"} ms`, "public"),
    statPill(formatBytes(response.sizeBytes), "public"),
    statPill(response.contentType || "content-type ?", "public")
  ].join("");
  renderCollapsibleJson(body);
  renderTree(body);
  setResultView(state.activeResultView);
}

function renderRawResponse(data) {
  state.lastResult = data;
  els.responseTitle.textContent = "Retour interne";
  els.responseStats.innerHTML = "";
  renderCollapsibleJson(data);
  renderTree(data);
  setResultView("json");
}

function renderCollapsibleJson(value) {
  els.jsonOutput.innerHTML = "";
  els.jsonOutput.appendChild(createJsonNode(value, null, 0, false));
}

function createJsonNode(value, key, depth, trailingComma) {
  if (!isJsonContainer(value)) {
    return createJsonPrimitiveLine(value, key, depth, trailingComma);
  }

  if (depth >= MAX_RENDER_DEPTH) {
    return createJsonPrimitiveLine("[Affichage tronqué : profondeur maximale atteinte]", key, depth, trailingComma);
  }

  const isArray = Array.isArray(value);
  const allEntries = Object.entries(value);
  const entries = allEntries.slice(0, MAX_RENDER_ENTRIES);
  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";
  const itemLabel = `${entries.length} ${isArray ? "élément" : "champ"}${entries.length > 1 ? "s" : ""}`;
  const node = document.createElement("div");
  node.className = "json-node";

  const openingLine = createJsonLine(depth);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "json-toggle";
  toggle.textContent = "−";
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-label", `Replier ${isArray ? "le tableau" : "l’objet"}`);
  openingLine.gutter.replaceChildren(toggle);
  appendJsonKey(openingLine.code, key);
  openingLine.code.appendChild(createJsonToken(openBracket, "punctuation"));

  const collapsedPreview = document.createElement("span");
  collapsedPreview.className = "json-collapsed-preview hidden";
  collapsedPreview.textContent = ` … ${itemLabel} ${closeBracket}${trailingComma ? "," : ""}`;
  openingLine.code.appendChild(collapsedPreview);
  node.appendChild(openingLine.line);

  const children = document.createElement("div");
  children.className = "json-children";
  entries.forEach(([entryKey, entryValue], index) => {
    children.appendChild(createJsonNode(
      entryValue,
      isArray ? null : entryKey,
      depth + 1,
      index < entries.length - 1 || allEntries.length > entries.length
    ));
  });
  if (allEntries.length > entries.length) {
    children.appendChild(createJsonPrimitiveLine(
      `[${allEntries.length - entries.length} entrées supplémentaires masquées]`,
      isArray ? null : "…",
      depth + 1,
      false
    ));
  }
  node.appendChild(children);

  const closingLine = createJsonLine(depth);
  closingLine.code.appendChild(createJsonToken(`${closeBracket}${trailingComma ? "," : ""}`, "punctuation"));
  node.appendChild(closingLine.line);

  toggle.addEventListener("click", () => {
    const collapsed = !children.classList.contains("hidden");
    children.classList.toggle("hidden", collapsed);
    closingLine.line.classList.toggle("hidden", collapsed);
    collapsedPreview.classList.toggle("hidden", !collapsed);
    toggle.textContent = collapsed ? "+" : "−";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", `${collapsed ? "Déplier" : "Replier"} ${isArray ? "le tableau" : "l’objet"}`);
  });

  return node;
}

function createJsonPrimitiveLine(value, key, depth, trailingComma) {
  const { line, code } = createJsonLine(depth);
  appendJsonKey(code, key);
  const type = value === null ? "null" : typeof value;
  const serialized = JSON.stringify(value) ?? String(value);
  code.appendChild(createJsonToken(`${serialized}${trailingComma ? "," : ""}`, type));
  return line;
}

function createJsonLine(depth) {
  const line = document.createElement("div");
  line.className = "json-line";

  const gutter = document.createElement("span");
  gutter.className = "json-gutter";
  line.appendChild(gutter);

  const code = document.createElement("span");
  code.className = "json-code";
  code.appendChild(document.createTextNode("  ".repeat(depth)));
  line.appendChild(code);

  return { line, gutter, code };
}

function appendJsonKey(container, key) {
  if (key === null) return;
  container.appendChild(createJsonToken(JSON.stringify(key), "key"));
  container.appendChild(createJsonToken(": ", "punctuation"));
}

function createJsonToken(text, type) {
  const token = document.createElement("span");
  token.className = `json-token json-${type}`;
  token.textContent = text;
  return token;
}

function isJsonContainer(value) {
  return value !== null && typeof value === "object";
}

function renderTree(value) {
  const stats = summarizeJson(value);
  els.treeSummary.innerHTML = `
    <div class="summary-card"><span>Objets</span><strong>${stats.objects}</strong></div>
    <div class="summary-card"><span>Tableaux</span><strong>${stats.arrays}</strong></div>
    <div class="summary-card"><span>Champs</span><strong>${stats.keys}</strong></div>
    <div class="summary-card"><span>Profondeur</span><strong>${stats.depth}</strong></div>
  `;
  els.treeOutput.innerHTML = "";
  for (const node of flattenJson(value)) {
    const row = document.createElement("div");
    row.className = "tree-node";
    row.style.paddingLeft = `${12 + node.depth * 18}px`;
    row.innerHTML = `
      <span class="tree-key">${escapeHtml(node.path)}</span>
      <span class="type-pill">${escapeHtml(node.type)}</span>
      <span class="tree-value">${escapeHtml(node.preview)}</span>
    `;
    els.treeOutput.appendChild(row);
  }
}

function summarizeJson(value) {
  const stats = { objects: 0, arrays: 0, keys: 0, depth: 0 };
  walk(value, 0);
  return stats;

  function walk(current, depth) {
    stats.depth = Math.max(stats.depth, depth);
    if (depth >= MAX_RENDER_DEPTH) return;
    if (Array.isArray(current)) {
      stats.arrays += 1;
      current.slice(0, MAX_RENDER_ENTRIES).forEach((item) => walk(item, depth + 1));
      return;
    }
    if (current && typeof current === "object") {
      stats.objects += 1;
      const entries = Object.entries(current).slice(0, MAX_RENDER_ENTRIES);
      stats.keys += entries.length;
      entries.forEach(([, item]) => walk(item, depth + 1));
    }
  }
}

function flattenJson(value) {
  const nodes = [];
  visit("$", value, 0);
  return nodes;

  function visit(path, current, depth) {
    const type = getType(current);
    nodes.push({ path, type, depth, preview: getPreview(current) });
    if (depth >= MAX_RENDER_DEPTH) return;
    if (Array.isArray(current)) {
      current.slice(0, 50).forEach((item, index) => visit(`[${index}]`, item, depth + 1));
      if (current.length > 50) {
        nodes.push({ path: `... ${current.length - 50} items`, type: "more", depth: depth + 1, preview: "" });
      }
    } else if (current && typeof current === "object") {
      const entries = Object.entries(current).slice(0, MAX_RENDER_ENTRIES);
      for (const [key, item] of entries) {
        visit(key, item, depth + 1);
      }
      if (Object.keys(current).length > entries.length) {
        nodes.push({ path: "…", type: "more", depth: depth + 1, preview: "Affichage tronqué" });
      }
    }
  }
}

function getType(value) {
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (value === null) return "null";
  return typeof value;
}

function getPreview(value) {
  if (Array.isArray(value)) return value.length ? `${value.length} elements` : "vide";
  if (value && typeof value === "object") return `${Object.keys(value).length} champs`;
  if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  return String(value);
}

function setResultView(view) {
  state.activeResultView = view;
  els.jsonViewBtn.classList.toggle("active", view === "json");
  els.treeViewBtn.classList.toggle("active", view === "tree");
  els.historyViewBtn.classList.toggle("active", view === "history");
  els.jsonViewBtn.setAttribute("aria-selected", String(view === "json"));
  els.treeViewBtn.setAttribute("aria-selected", String(view === "tree"));
  els.historyViewBtn.setAttribute("aria-selected", String(view === "history"));
  els.jsonView.classList.toggle("hidden", view !== "json");
  els.treeView.classList.toggle("hidden", view !== "tree");
  els.historyView.classList.toggle("hidden", view !== "history");
}

function toggleResultMaximized(force) {
  state.resultMaximized = typeof force === "boolean" ? force : !state.resultMaximized;
  document.body.classList.toggle("result-maximized", state.resultMaximized);
  els.maximizeResultBtn.textContent = state.resultMaximized ? "Reduire" : "Maximiser";
  els.maximizeResultBtn.setAttribute("aria-pressed", String(state.resultMaximized));
  if (state.resultMaximized) {
    document.querySelector(".response-shell")?.scrollIntoView({ block: "nearest" });
  }
}

function pushHistory(payload, data) {
  const entry = {
    at: new Date().toISOString(),
    method: payload.method,
    path: redactApiPath(payload.path),
    query: redactSensitiveParams(payload.query, ""),
    body: redactSensitiveParams(payload.body, ""),
    bodyMode: payload.bodyMode,
    status: data.response?.status || "?",
    durationMs: data.response?.durationMs || "?"
  };
  state.history = [entry, ...state.history].slice(0, 20);
  sessionStorage.setItem("bs.history", JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  if (!state.history.length) {
    els.historyOutput.innerHTML = `<div class="history-item">Aucun historique pour le moment.</div>`;
    return;
  }

  els.historyOutput.innerHTML = "";
  for (const entry of state.history) {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <strong>${escapeHtml(entry.method)} ${escapeHtml(entry.path)}</strong>
      <span class="muted">${new Date(entry.at).toLocaleString()} - status ${escapeHtml(entry.status)} - ${escapeHtml(entry.durationMs)} ms</span>
      <button type="button" class="secondary">Recharger</button>
    `;
    item.querySelector("button").addEventListener("click", () => loadHistoryEntry(entry));
    els.historyOutput.appendChild(item);
  }
}

function loadHistoryEntry(entry) {
  els.methodSelect.value = entry.method;
  els.pathInput.value = entry.path;
  els.queryParams.innerHTML = "";
  els.bodyParams.innerHTML = "";
  for (const [key, value] of Object.entries(entry.query || {})) addParamRow("query", key, value, "Historique");
  for (const [key, value] of Object.entries(entry.body || {})) addParamRow("body", key, value, "Historique");
  const radio = document.querySelector(`input[name="bodyMode"][value="${entry.bodyMode || "query"}"]`);
  if (radio) radio.checked = true;
  syncParameterControls("query");
  showToast("Requete rechargee.");
}

async function copyCurl() {
  const payload = buildPayload();
  const safeQuery = redactSensitiveParams(payload.query);
  const safeBody = redactSensitiveParams(payload.body);
  const apiBase = state.config?.apiBase || "https://api.betaseries.com";
  const url = new URL(
    /^https?:\/\//i.test(payload.path) ? payload.path : payload.path.startsWith("/") ? payload.path : `/${payload.path}`,
    apiBase
  );
  if (url.origin !== apiBase || url.hash) throw new Error("Le chemin BetaSeries est invalide.");
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_PARAMETER.test(key)) url.searchParams.set(key, "[MASQUÉ]");
  }
  Object.entries(safeQuery).forEach(([key, value]) => url.searchParams.set(key, value));
  if (payload.method !== "GET" && payload.bodyMode === "query") {
    Object.entries(safeBody).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  const lines = [
    `curl -X ${payload.method} '${url.toString()}'`,
    "  -H 'X-BetaSeries-Key: $BETASERIES_API_KEY'",
    `  -H 'X-BetaSeries-Version: ${state.config?.apiVersion || "3.0"}'`
  ];
  if (payload.credentials.accessToken) {
    lines.push("  -H 'Authorization: Bearer $BETASERIES_ACCESS_TOKEN'");
  }
  if (payload.method !== "GET" && payload.bodyMode !== "query") {
    const body = payload.bodyMode === "json"
      ? JSON.stringify(safeBody)
      : new URLSearchParams(safeBody).toString();
    lines.push(`  -H 'Content-Type: ${payload.bodyMode === "json" ? "application/json" : "application/x-www-form-urlencoded"}'`);
    lines.push(`  --data '${body.replaceAll("'", "'\\''")}'`);
  }

  await navigator.clipboard.writeText(lines.join(" \\\n"));
  showToast("Commande cURL copiée sans les secrets.");
}

/** Ne conserve jamais les valeurs manifestement sensibles dans l'historique ou le presse-papiers. */
function redactSensitiveParams(params = {}, replacement = "[MASQUÉ]") {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [
    key,
    SENSITIVE_PARAMETER.test(key) ? replacement : value
  ]));
}

function redactApiPath(path) {
  try {
    const isAbsolute = /^https?:\/\//i.test(path);
    const url = new URL(isAbsolute ? path : path.startsWith("/") ? path : `/${path}`, "https://api.betaseries.com");
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_PARAMETER.test(key)) url.searchParams.set(key, "[MASQUÉ]");
    }
    return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
  } catch {
    return "[CHEMIN INVALIDE]";
  }
}

function trustedDocsUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.origin === "https://developers.betaseries.com" ? url.toString() : "";
  } catch {
    return "";
  }
}

async function runUiAction(action) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    showToast(error.message || "L’action a échoué.");
  }
}

function readSessionHistory() {
  try {
    const history = JSON.parse(sessionStorage.getItem("bs.history") || "[]");
    return Array.isArray(history) ? history.slice(0, 20) : [];
  } catch {
    sessionStorage.removeItem("bs.history");
    return [];
  }
}

function statPill(label, variant) {
  return `<span class="status-pill ${variant}">${escapeHtml(label)}</span>`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "taille ?";
  const kib = bytes / 1024;
  if (kib < 0.1 && bytes > 0) return "< 0.1 Ko";
  return `${kib.toLocaleString("fr-FR", {
    minimumFractionDigits: kib < 10 ? 1 : 0,
    maximumFractionDigits: kib < 10 ? 1 : 0
  })} Ko`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
