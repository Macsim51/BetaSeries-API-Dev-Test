/**
 * BetaSeries ne renvoie actuellement pas le paramètre OAuth `state` dans son
 * callback. On exige tout de même qu'un flux ait été initié dans cet onglet et,
 * si le fournisseur renvoie un state, on le compare strictement.
 */
export function isOAuthCallbackStateValid(expectedState, receivedState) {
  if (!expectedState) return false;
  return receivedState === null || receivedState === expectedState;
}
