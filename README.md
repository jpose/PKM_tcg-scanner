# ⚡ PokéScan

Application web pour scanner vos cartes Pokémon avec la caméra du téléphone,
les identifier grâce à l'IA (Google Gemini, gratuit), et gérer votre
collection avec les vraies données officielles (image, extension, cote) via
l'API Pokémon TCG (gratuite).

## Fonctionnement

1. Vous prenez une photo de la carte avec votre téléphone (dans le navigateur).
2. La photo est envoyée à l'API Gemini (gratuite) qui identifie le nom, le
   numéro et l'extension de la carte.
3. L'app interroge **TCGdex** (api.tcgdex.net), une base de données Pokémon
   TCG open source et entièrement gratuite (aucune clé, aucune inscription)
   pour retrouver la carte exacte, son image officielle et sa cote de marché
   (Cardmarket en euros et/ou TCGPlayer en dollars selon les cartes).
4. Vous choisissez la bonne carte parmi les résultats et l'ajoutez à votre
   collection.
5. La collection est sauvegardée directement dans le navigateur
   (`localStorage`) — aucune base de données à configurer pour démarrer.

## 1. Obtenir une ou plusieurs clés Gemini gratuites

1. Allez sur https://aistudio.google.com/app/apikey
2. Connectez-vous avec un compte Google.
3. Cliquez sur **Create API key**.
4. Copiez la clé, vous en aurez besoin ci-dessous.

Le tier gratuit de Gemini (modèle `gemini-2.0-flash`) permet un usage courant
sans carte bancaire, avec un quota par clé (par minute et par jour).

### Load balancing sur plusieurs clés (recommandé)

L'app peut répartir automatiquement les requêtes entre **plusieurs clés
Gemini**, en round-robin, et bascule sur la clé suivante si l'une d'elles
atteint son quota. Cela double (ou plus) le volume gratuit disponible.

Pour utiliser 2 clés (ou plus) :

1. Créez une deuxième clé sur https://aistudio.google.com/app/apikey — soit
   avec le même compte Google, soit avec un second compte Google pour avoir
   deux quotas totalement indépendants (recommandé pour maximiser le gratuit).
2. Renseignez-les dans une seule variable, séparées par une virgule :
   ```
   GEMINI_API_KEYS=cle_numero_1,cle_numero_2
   ```
   Vous pouvez en mettre autant que vous voulez, toujours séparées par des
   virgules.

Si vous n'avez qu'une seule clé, `GEMINI_API_KEY=votre_cle` (sans le S)
fonctionne toujours normalement.

## 2. Lancer en local (facultatif, pour tester avant de déployer)

```bash
npm install
cp .env.example .env.local
# Éditez .env.local et collez votre clé GEMINI_API_KEY
npm run dev
```

Ouvrez http://localhost:3000 — utilisez le bouton "importer une photo" si
votre ordinateur n'a pas de caméra pratique, ou testez directement depuis un
téléphone sur le même réseau.

## 3. Héberger sur GitHub

```bash
git init
git add .
git commit -m "Premier commit : PokéScan"
git branch -M main
git remote add origin https://github.com/VOTRE-UTILISATEUR/pokescan.git
git push -u origin main
```

(Remplacez l'URL par celle de votre propre dépôt vide, créé au préalable sur
github.com.)

## 4. Déployer sur Vercel

1. Allez sur https://vercel.com et connectez-vous avec votre compte GitHub.
2. Cliquez sur **Add New → Project**.
3. Sélectionnez le dépôt `pokescan` que vous venez de pousser.
4. Vercel détecte automatiquement Next.js, aucune configuration de build à
   changer.
5. Avant de cliquer sur **Deploy**, ouvrez la section **Environment
   Variables** et ajoutez :
   - `GEMINI_API_KEYS` = vos clés séparées par une virgule, ex.
     `AIza...clé1,AIza...clé2` (ou `GEMINI_API_KEY` avec une seule clé)
   - Aucune autre clé n'est nécessaire : la base de données de cartes
     (TCGdex) est gratuite et ne demande pas d'authentification.
6. Cliquez sur **Deploy**. Au bout d'une minute, votre app est en ligne sur
   une URL du type `pokescan-xxxx.vercel.app`.

Chaque `git push` sur `main` redéploiera automatiquement.

## Notes importantes

- **Accès caméra** : les navigateurs exigent HTTPS pour autoriser la caméra.
  Vercel fournit HTTPS automatiquement, donc cela fonctionnera en production.
  En local (`localhost`), les navigateurs l'autorisent aussi en HTTP.
- **Coût réel** : Gemini, l'API Pokémon TCG et Vercel (plan Hobby) sont
  gratuits pour un usage personnel raisonnable. Si l'app devient très
  populaire, il faudra surveiller les quotas.
- **Stockage de la collection** : actuellement en `localStorage`, donc
  propre à chaque navigateur/appareil. Si vous voulez une collection
  synchronisée entre appareils ou partagée entre plusieurs utilisateurs,
  l'étape suivante serait d'ajouter une base de données gratuite (par
  exemple Supabase) — dites-le-moi si vous voulez que je l'ajoute.

## Structure du projet

```
app/
  api/identify/route.ts   → appelle Gemini pour identifier la carte
  components/              → CameraCapture, CardResults, CollectionGrid
  lib/pokemonTcg.ts        → requêtes vers l'API Pokémon TCG
  lib/collection.ts        → gestion de la collection en localStorage
  page.tsx                 → page principale (onglets Scanner / Collection)
```
