# Publier une release

## Voie normale : CI GitHub Actions (recommandée)

La publication est automatisée par `.github/workflows/release.yml` via le
**trusted publishing** npm (OIDC) : aucun token n'est stocké dans le repo.

### Configuration initiale — ✅ faite (v0.1.0/v0.1.1, juillet 2026)

Conservée pour référence si le package ou le repo change :

1. Publier la toute première version manuellement (voir plus bas) — npm exige
   que le package existe avant de pouvoir lui attacher un trusted publisher.
   La 2FA doit être activée sur le compte npm.
2. Sur npmjs.com → package `identite-ts` → **Settings** → **Trusted publisher** :
   - Provider : GitHub Actions
   - Organisation/utilisateur : `lau-sam`
   - Repository : `identite-ts`
   - Workflow filename : `release.yml`

### À chaque release

```bash
# 1. S'assurer que master est propre et la CI verte
npm version patch        # ou minor / major — met à jour package.json + crée le tag vX.Y.Z
git push && git push --tags
```

Le push du tag `vX.Y.Z` déclenche le workflow : lint, typecheck, tests, build,
puis `npm publish --provenance --access public`. La provenance ajoute le badge
de vérification sur npmjs.com.

## Voie manuelle (secours)

```bash
npm login                # compte npm avec 2FA
npm run build
npm pack --dry-run       # vérifier le contenu du tarball (dist/ uniquement)
npm publish --access public
git tag vX.Y.Z && git push --tags
```

`prepublishOnly` rejoue automatiquement lint + typecheck + tests + build avant
toute publication, CI comme manuelle.

## Checklist avant release

- [ ] `npm test` vert
- [ ] `npx publint` et `npx attw --pack .` sans erreur
- [ ] CHANGELOG.md à jour
- [ ] Version de `package.json` == tag
