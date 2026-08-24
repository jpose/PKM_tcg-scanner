<div align="center">

  <img src="logo.jpg" alt="TCG Manager Logo" width="200" style="border-radius: 16px;">

  # TCG Manager

  **Application web (PWA) de scan, gestion et cotation de cartes Pokémon TCG en temps réel.**

</div>

---

## 📱 À propos

**TCG Manager** est une Progressive Web App (PWA) fluide et réactive conçue pour faciliter le suivi de votre collection de cartes Pokémon. Grâce à l'analyse d'image par IA et aux API du marché, l'application identifie automatiquement vos cartes, récupère leurs cotes actuelles et permet de gérer votre stock par finition.

---

## ✨ Fonctionnalités principales

- **📸 Scan par IA :** Prenez une photo de votre carte avec l'appareil photo de votre smartphone pour l'identifier instantanément.
- **💶 Cotes en temps réel :** Récupération automatique des prix du marché (en € et $) via **TCGdex** et **Pokémon TCG API** (Cardmarket / TCGplayer).
- **✨ Gestion multi-finitions :** Suivez séparément vos exemplaires selon leur version (**Normal**, **Reverse**, **Holo**).
- **📊 Suivi de valeur :** Calcul automatique de la valeur totale estimée de votre collection.
- **💾 Sauvegarde & Restauration (100 % locale) :** Exportez et importez votre base de données au format `.json` pour ne jamais perdre votre collection, même en cas de nettoyage du navigateur.
- **📱 PWA & Offline-First :** Installable sur iOS/Android comme une application native via le navigateur.

---

## 🚀 Installation & Utilisation

### En tant qu'utilisateur
1. Ouvrez l'application dans votre navigateur mobile (Safari sur iOS, Chrome sur Android).
2. Sélectionnez **« Ajouter à l'écran d'accueil »** pour l'installer comme PWA.
3. Autorisez l'accès à la caméra lors du premier scan.

### Pour le développement local

1. **Cloner le projet :**
   ```bash
   git clone [https://github.com/votre-utilisateur/tcg-manager.git](https://github.com/votre-utilisateur/tcg-manager.git)
   cd tcg-manager
