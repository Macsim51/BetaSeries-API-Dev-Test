# Contribuer

Merci de vouloir améliorer l’Explorateur API BetaSeries.

## Avant de commencer

1. Vérifiez qu’une issue similaire n’existe pas déjà.
2. Pour une évolution importante, ouvrez une issue afin de discuter du besoin et du périmètre.
3. Ne joignez jamais de clé API, client secret, jeton OAuth ou contenu de `.env` à une issue.

## Environnement de développement

Le projet nécessite Node.js 22 ou plus récent et n’a aucune dépendance npm. Dupliquez `.env.example` en `.env`, renseignez vos propres identifiants BetaSeries, puis lancez :

```bash
npm run dev
```

Avant de proposer une modification :

```bash
npm run check
```

## Pull requests

- restez concentré sur un changement cohérent ;
- ajoutez ou adaptez les tests lorsque le comportement change ;
- documentez les nouvelles variables de configuration et fonctionnalités ;
- utilisez des messages de commit courts, précis et à l’impératif ;
- expliquez comment vous avez vérifié le changement.

En contribuant, vous acceptez que votre code soit distribué sous la licence MIT du projet.
