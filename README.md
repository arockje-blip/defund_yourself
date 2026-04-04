# 🛸 DEFUND YOURSELF: COMMANDER'S ARISE

**Defund Yourself** is a high-stakes, real-time tactical defense game where you take command of a rogue nation resisting the "Global Coalition Force" (USA, UK, PAK, CHINA). Build your power, manage top-secret munitions, and coordinate a global defense against a scaling enemy.

---

## 🎮 CORE MECHANICS

### 1. Resources & Power
*   **Start Farming**: Your primary economic engine. Click to generate resources used to commission battalions and craft advanced munitions.
*   **Total Power**: Your total defensive capability. You must exceed **70% of Coalition Power** to initiate a counter-strike.
*   **Troop Capacity**: While Infantry is limitless, advanced Navy and Air units require strategic management of your "Space Remaining." This capacity doubles each level (starting at 10,000).

### 2. Strategic Units
*   🪖 **Infantry (Army)**: Long-range ground forces.
    *   **Battalions**: Mobilize in parallel ($5,000 each for 10,000 troops).
    *   **Ammo & Gun**: 12 Bullets (2 Magazines of 6).
    *   **Visual Logic**: Muzzle Flash (`createMuzzleFlash`) using `setLineDash([2, 4])` for yellow tracer fire.
    *   **Vulnerability**: **3s Reload** during which they are vulnerable to 1-hit kills from enemy projectiles.
*   🚢 **Naval Shipyard**: Commission custom stealth vessels with high durability and customizable specs.
*   ✈️ **Hangar**: Deploy rapid-response aircraft with Electronic Warfare capabilities and high-speed interception.

### 3. Munitions & Defense
*   🚀 **Brahmos (Defense)**: Automatic interception missiles. Essential for stopping incoming projectiles. Use more for higher success rates.
*   🎯 **Attack Missiles**: Strategic strikes (HE, EMP, NUKE) against Coalition power levels.
*   📡 **Radar Control**: Scan up to **10,000KM**. Toggle **Electronic Warfare (EW)** modes to boost defensive output.

### 4. Secret Operations (Dark Protocol) ☢️
High-stakes intervention tools:
*   **Cyber Jamming**: Disrupt enemy nation power directly via digital warfare.
*   **Stealth Cloaking**: Reduce enemy accuracy and intercept chances for your own units.
*   **Nuclear MIRV**: Devastating strikes against all Coalition nations (Cost: $100k per warhead).

---

## 🌎 CLOUD & SECURITY FEATURES
*   **Secure Authentication**: **Bcrypt-hashed** passwords for all commanders.
*   **Admin Recovery Protocol**: Optional **AES-256 encrypted recovery** with the secret **Elite111** key.
*   **Elite General Access**: Use `Elite` / `111` for a public master-level account (Level 99).
*   **Real-time Leaderboard**: Powered by Firebase Firestore. Compete with commanders globally.
*   **Cloud Sync**: Automatic progress saving (Level, Resources, Units) to Firebase.

---

## 🛠️ TECH STACK
*   **Frontend**: HTML5 Canvas API (Drawing Engine), Vanilla JavaScript (ES6+), CSS3.
*   **Unit AI & Gun Logic**: 
    - **Vector Math**: `Math.hypot` for distance and `Math.atan2` for projectile trajectory.
    - **Muzzle Flash**: Custom particle system for yellow tracer fire.
    - **State Management**: Frame-by-frame unit lifecycle tracking (`life` counter).
*   **Security**: Bcrypt.js (Hashing), CryptoJS (AES-256 Encryption).
*   **Backend**: Firebase Firestore (Real-time Database & Persistence).

---

## 🚀 GETTING STARTED
1.  **Initialize**: Open `index.html` in any modern browser.
2.  **Commission**: Sign up with a unique Commander name and secure password.
3.  **Mobilize**: Use your starting funds to farm resources and mobilize your first Battalions.
4.  **Arise**: When your power is sufficient, click **ATTACK AND DEFUND** to begin the global war.

*Developed by AJ (Master Commander)*
