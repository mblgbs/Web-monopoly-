# Monopoly Web Multijoueur

Mini application web inspirée du Monopoly, jouable à plusieurs via un code de salle.

## Fonctionnalités

- Création/rejoint d'une salle multijoueur en temps réel.
- Banque de départ (1500 M$ par joueur).
- **Fausses cartes bancaires (CB fictives)** générées pour chaque joueur.
- Transferts d'argent entre joueurs.
- Journal des actions de la partie.
- API REST pour piloter une partie (salles, joueurs, transferts).
- **Page admin** (`/admin.html`) pour visualiser les salles actives et consulter leurs détails.

## Lancer le projet

```bash
npm install
npm start
```

Puis ouvrir `http://localhost:3000` dans plusieurs onglets (ou navigateurs) pour simuler plusieurs joueurs.

La page d'administration est disponible sur `http://localhost:3000/admin.html`.

## Structure

- `server.js` : serveur Express + Socket.IO.
- `public/index.html` : interface utilisateur.
- `public/app.js` : logique client multijoueur.
- `public/admin.html` + `public/admin.js` : interface d'administration des salles.
- `public/styles.css` : styles.

## API

Base URL: `http://localhost:3000`

### Vérifier l'API

```bash
curl http://localhost:3000/api/health
```

### Lister les salles

```bash
curl http://localhost:3000/api/rooms
```

### Détails d'une salle

```bash
curl http://localhost:3000/api/rooms/ABCD
```

### Rejoindre/Créer une salle via API

```bash
curl -X POST http://localhost:3000/api/rooms/ABCD/join \
  -H "Content-Type: application/json" \
  -d '{"playerName":"Alice"}'
```

### Effectuer un transfert via API

```bash
curl -X POST http://localhost:3000/api/rooms/ABCD/transfer \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"api-1","targetId":"api-2","amount":100}'
```

## Authentification FranceConnect (MVP SSO)

L'API peut valider les tokens auprès de `FranceConnect-Monopoly` pour sécuriser `/api/*`.

Variables d'environnement:

- `SERVICE_AUTH_ENABLED=true`
- `FRANCECONNECT_BASE_URL=http://127.0.0.1:8001`
- `AUTH_REQUEST_TIMEOUT_MS=2500`

Comportement:

- `/api/health` reste public
- les autres routes `/api/*` exigent `Authorization: Bearer <token>`
- token invalide/manquant -> `401`
- fournisseur d'auth indisponible -> `503`

## Sauvegarde centralisee (save-service + PostgreSQL)

Le serveur web sauvegarde maintenant les salles dans `save-service`.
En cas d'indisponibilite du service, l'application continue en mode memoire (fallback).

Variables d'environnement:

- `SAVE_SERVICE_BASE_URL=http://127.0.0.1:8010`
- `SAVE_SERVICE_TIMEOUT_MS=2500`
- `SAVE_SERVICE_RETRIES=1`
- `SAVE_SERVICE_API_TOKEN=` (optionnel)

## API Compte de Banque Monopoly (Python)

Cette API permet de gérer des comptes de joueurs pour une banque Monopoly en mémoire.

### Lancer l'API

```bash
python api.py
```

Serveur par défaut : `http://0.0.0.0:8002`

### Points d'extrémité

#### Vérification santé

- `GET /health`

#### Comptes

- `POST /comptes`
  - Corps: `{ "nom": "Alice", "solde_initial": 1500 }`
- `GET /comptes`
- `GET /comptes/{id}`
- `POST /comptes/{id}/depot`
  - Corps: `{ "montant": 200 }`
- `POST /comptes/{id}/retrait`
  - Corps: `{ "montant": 100 }`

#### Transfert

- `POST /transferts`
  - Corps: `{ "source_id": 1, "destination_id": 2, "montant": 300 }`

### Exemples de boucles curl

```bash
curl -X POST http://localhost:8002/comptes \
  -H "Content-Type: application/json" \
  -d '{"nom":"Alice","solde_initial":1500}'

curl -X POST http://localhost:8002/comptes/1/depot \
  -H "Content-Type: application/json" \
  -d '{"montant":200}'

curl -X POST http://localhost:8002/transferts \
  -H "Content-Type: application/json" \
  -d '{"source_id":1,"destination_id":2,"montant":100}'
```

### Tests

```bash
python -m unittest discover -s tests -v
```
