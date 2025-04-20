import * as THREE from 'three';

// Default weapon config (can be expanded and loaded from data)
const defaultWeapons = {
    pistol: {
        name: "Pistol",
        damage: 8,
        cooldown: 0.3, // seconds
        range: 50,
        automatic: false,
        ammoMax: Infinity, // Example infinite ammo
        ammoCurrent: Infinity,
        // modelPath: 'assets/models/pistol.glb', // Optional model path
        // muzzleFlash: true, // Optional effect flag
    },
    rifle: {
        name: "Rifle",
        damage: 15,
        cooldown: 0.1,
        range: 100,
        automatic: true,
        ammoMax: 150,
        ammoCurrent: 150,
        // modelPath: 'assets/models/rifle.glb',
        // muzzleFlash: true,
    }
};

export class WeaponManager {
    constructor(engine, player) {
        this.engine = engine;
        this.player = player; // Reference to the player using the weapons

        this.weapons = new Map(); // Store weapon data { id: config }
        this.equippedWeaponId = null;
        this.currentWeapon = null; // The actual equipped weapon config

        this.fireTimer = 0; // Cooldown timer for firing

        this.loadDefaultWeapons();
        console.log("WeaponManager Initialized");
    }

    loadDefaultWeapons() {
        // In a real game, load this from config files/data
        for (const id in defaultWeapons) {
            this.addWeapon(id, defaultWeapons[id]);
        }
        // Equip the first weapon added by default
        if (this.weapons.size > 0) {
            this.equipWeapon(this.weapons.keys().next().value);
        }
    }

    addWeapon(id, config) {
        if (this.weapons.has(id)) {
            // Handle picking up ammo for existing weapon?
            const existing = this.weapons.get(id);
            if (existing.ammoCurrent !== Infinity && config.ammoMax > 0) {
                 existing.ammoCurrent = Math.min(existing.ammoMax, existing.ammoCurrent + (config.ammoCurrent || 0));
                 console.log(`Added ammo to ${id}. Current: ${existing.ammoCurrent}`);
            }
        } else {
            this.weapons.set(id, { ...config }); // Store a copy
            console.log(`Weapon added: ${config.name} (ID: ${id})`);
            // If no weapon equipped, equip this one
            if (!this.equippedWeaponId) {
                this.equipWeapon(id);
            }
        }
         this.updateUI(); // Update HUD if ammo changed etc.
    }

    equipWeapon(id) {
        if (!this.weapons.has(id) || this.equippedWeaponId === id) {
            return false; // Weapon doesn't exist or is already equipped
        }

        this.equippedWeaponId = id;
        this.currentWeapon = this.weapons.get(id);
        this.fireTimer = 0; // Reset cooldown when switching

        console.log(`Weapon equipped: ${this.currentWeapon.name}`);
        // TODO: Attach/show the correct weapon model on the player
        // TODO: Update UI to show current weapon/ammo
         this.updateUI();
        return true;
    }

    update(dt) {
        if (this.fireTimer > 0) {
            this.fireTimer -= dt;
        }
    }

    canFire() {
        if (!this.currentWeapon || this.fireTimer > 0) {
            return false; // No weapon or on cooldown
        }
        if (this.currentWeapon.ammoCurrent !== Infinity && this.currentWeapon.ammoCurrent <= 0) {
            // TODO: Play 'out of ammo' sound
            console.log(`${this.currentWeapon.name} out of ammo.`);
            return false; // Out of ammo
        }
        return true;
    }

    canAutoFire() {
        return this.currentWeapon?.automatic ?? false;
    }

    // Attempt to fire the current weapon
    fire() {
        if (!this.canFire()) {
            return false;
        }

        this.fireTimer = this.currentWeapon.cooldown; // Reset cooldown

        // Consume ammo
        if (this.currentWeapon.ammoCurrent !== Infinity) {
            this.currentWeapon.ammoCurrent--;
        }

        // --- Determine spawn position and direction ---
        // Get world position of player's camera target (or a dedicated muzzle object)
        const spawnPos = this.player.cameraTarget.getWorldPosition(new THREE.Vector3());
        // Get player's current forward direction
        const direction = this.player.forwardDirection.clone();

        // --- Spawn Bullet via Engine ---
        this.engine.spawnBullet(
            spawnPos,
            direction,
            this.currentWeapon.damage,
            true // isPlayerBullet
        );

        // --- Optional Effects ---
        // Play fire sound (engine should handle this)
        // Trigger muzzle flash particle effect
        // Trigger weapon recoil animation/camera shake

        console.log(`Fired ${this.currentWeapon.name}. Ammo: ${this.currentWeapon.ammoCurrent}`);
        this.updateUI(); // Update ammo display
        return true; // Shot was fired
    }

    switchToNextWeapon() {
        if (this.weapons.size <= 1) return;
        const weaponIds = Array.from(this.weapons.keys());
        const currentIndex = weaponIds.indexOf(this.equippedWeaponId);
        const nextIndex = (currentIndex + 1) % weaponIds.length;
        this.equipWeapon(weaponIds[nextIndex]);
    }

    switchToPreviousWeapon() {
        if (this.weapons.size <= 1) return;
        const weaponIds = Array.from(this.weapons.keys());
        const currentIndex = weaponIds.indexOf(this.equippedWeaponId);
        const prevIndex = (currentIndex - 1 + weaponIds.length) % weaponIds.length;
        this.equipWeapon(weaponIds[prevIndex]);
    }

    getCurrentAmmo() {
        return this.currentWeapon?.ammoCurrent ?? 0;
    }
    getMaxAmmo() {
         return this.currentWeapon?.ammoMax ?? 0;
     }
     getCurrentWeaponName() {
         return this.currentWeapon?.name ?? "None";
     }

    updateUI() {
        // Tell the UI Manager to update weapon/ammo display
         this.engine.uiManager?.updateWeaponInfo(this.getCurrentWeaponName(), this.getCurrentAmmo(), this.getMaxAmmo());
     }
}
