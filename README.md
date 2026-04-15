# Monopoly Web Multijoueur

Mini application web inspirée du Monopoly, jouable à plusieurs via un code de salle.

## Fonctionnalités

- Création/rejoint d'une salle multijoueur en temps réel.
- Banque de départ (1500 M$ par joueur).
- **Fausses cartes bancaires (CB fictives)** générées pour chaque joueur.
- Transferts d'argent entre joueurs.
- Journal des actions de la partie.

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
