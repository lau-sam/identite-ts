# Publier une release

## Voie normale : CI GitHub Actions (recommandée)

La publication est automatisée par `.github/workflows/release.yml` via le
**trusted publishing** npm (OIDC) : aucun token n'est stocké dans le repo.

### Configuration initiale (une seule fois)

1. Publier la toute première version manuellement (voir plus bas) — npm exige
   que le package existe avant de pouvoir lui attacher un trusted publisher.
   Alternative : créer le package via l'interface npmjs.com.
2. Sur npmjs.com → package `identite-ts` → **Settings** → **Trusted publisher** :
   - Provider : GitHub Actions
   - Organisation/utilisateur : votre compte GitHub
   - Repository : `identite-ts`
   - Workflow filename : `release.yml`
3. (Conseillé) Dans les settings du package, exiger la 2FA ou le trusted
   publishing pour toute publication.

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
