# Monopoly Web Multijoueur

Mini application web inspirée du Monopoly, jouable à plusieurs via un code de salle.

## Fonctionnalités

- Création/rejoint d'une salle multijoueur en temps réel.
- Banque de départ (1500 M$ par joueur).
- **Fausses cartes bancaires (CB fictives)** générées pour chaque joueur.
- Transferts d'argent entre joueurs.
- Journal des actions de la partie.
- API REST pour piloter une partie (salles, joueurs, transferts).

## Lancer le projet

```bash
npm install
npm start
```

Puis ouvrir `http://localhost:3000` dans plusieurs onglets (ou navigateurs) pour simuler plusieurs joueurs.

## Structure

- `server.js` : serveur Express + Socket.IO.
- `public/index.html` : interface utilisateur.
- `public/app.js` : logique client multijoueur.
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
