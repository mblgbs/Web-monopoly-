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

## API Compte de Banque Monopoly

Cette API permet de gérer des comptes de joueurs pour une banque Monopoly.

### Lancer l'API

```bash
npm start
```

Serveur par défaut : `http://0.0.0.0:3000`

### Points d'extrémité

#### Vérification santé

- `GET /health`

#### Comptes

- `POST /comptes`  
  corps: `{ "nom": "Alice", "solde_initial": 1500 }`
- `GET /comptes`
- `GET /comptes/{id}`
- `POST /comptes/{id}/depot`  
  corps: `{ "montant": 200 }`
- `POST /comptes/{id}/retrait`  
  corps: `{ "montant": 100 }`

#### Transfert

- `POST /transferts`  
  corps: `{ "source_id": 1, "destination_id": 2, "montant": 300 }`

### Exemples cURL

```bash
curl -X POST http://localhost:3000/comptes \
  -H 'Content-Type: application/json' \
  -d '{"nom":"Alice","solde_initial":1500}'

curl -X POST http://localhost:3000/comptes/1/depot \
  -H 'Content-Type: application/json' \
  -d '{"montant":200}'

curl -X POST http://localhost:3000/transferts \
  -H 'Content-Type: application/json' \
  -d '{"source_id":1,"destination_id":2,"montant":100}'
```

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
