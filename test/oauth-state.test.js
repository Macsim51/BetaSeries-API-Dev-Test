import assert from "node:assert/strict";
import test from "node:test";
import { isOAuthCallbackStateValid } from "../public/oauth-state.js";

test("le callback OAuth BetaSeries accepte l'absence de state après un flux initié", () => {
  assert.equal(isOAuthCallbackStateValid("state-attendu", null), true);
});

test("le callback OAuth refuse un flux non initié ou un state différent", () => {
  assert.equal(isOAuthCallbackStateValid(null, null), false);
  assert.equal(isOAuthCallbackStateValid("state-attendu", ""), false);
  assert.equal(isOAuthCallbackStateValid("state-attendu", "state-inattendu"), false);
  assert.equal(isOAuthCallbackStateValid("state-attendu", "state-attendu"), true);
});
