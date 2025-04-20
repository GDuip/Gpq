import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Shared geometry/material for basic powerup visuals
const powerUpGeometry = new THREE.IcosahedronGeometry(0.3, 0); // Simple shape
const powerUpMaterials = {
    heal: new THREE.MeshStandardMaterial({ color: 0xff69b4, emissive: 0x441122, roughness: 0.4 }), // Pink
    speed: new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0x444400, roughness: 0.4 }), // Yellow
    shield: new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x004444, roughness: 0.4 }), // Cyan
    default: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }) // White default
};

export class PowerUp {
    constructor(engine) {
        this.engine = engine;
        this.physics = engine.physics;

        this.type = 'default'; // Set by reset
        this.config = null; // From engine.powerUpTypes

        // --- State ---
        this._destroyed = true; // Start inactive
        this.bobTimer = Math.random() * Math.PI * 2; // Random start offset for bobbing
        this.bobSpeed = 1.5;
        this.bobAmount = 0.1;
        this.rotateSpeed = 0.8;

        // --- 3D Representation ---
        this.mesh = new THREE.Mesh(powerUpGeometry); // Use shared geometry
        this.mesh.name = "PowerUpMesh";
        this.mesh.visible = false;
        // Powerups usually don't cast shadows but might receive them
        this.mesh.castShadow = false;
        this.mesh.receiveShadow = true;

        // --- Physics ---
        this.physicsBody = null; // Created in reset

        // --- Collision ---
        // Uses physics body for collision detection
    }

    reset(position, type) {
        this.type = type;
        this.config = this.engine.constructor.powerUpTypes[type]; // Get config from static engine property
        if (!this.config) {
            console.warn(`PowerUp type "${type}" configuration not found! Using default.`);
            this.type = 'default';
            this.config = { duration: 0 }; // Minimal default config
        }

        this._destroyed = false;
        this.mesh.visible = true;
        this.mesh.position.copy(position);
        this.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0); // Random initial rotation
        this.bobTimer = Math.random() * Math.PI * 2;

        // Assign correct material
        this.mesh.material = powerUpMaterials[type] || powerUpMaterials.default;

        // Create physics body if it doesn't exist
        if (!this.physicsBody) {
            const shape = this.physics.createSphereShape(0.35); // Slightly larger than visual
            this.physicsBody = new CANNON.Body({
                mass: 0, // Static body - doesn't move due to physics forces
                shape: shape,
                material: this.physics.createMaterial('powerup'), // Use specific material
                type: CANNON.Body.STATIC, // Make it static so it doesn't fall
                collisionFilterGroup: 2, // Example collision group (optional)
                collisionFilterMask: 1 // Example: Collide only with group 1 (e.g., player) (optional)
            });
            // Link game object to physics body
            this.physicsBody.gameObject = this;
            // Add to physics world (Engine handles this via addBody on spawn)
        }
        // Update physics body position
        this.physicsBody.position.copy(position);
        this.physicsBody.velocity.set(0,0,0); // Ensure it's not moving

        // Engine's spawnPowerUp should call physics.addBody(this, this.physicsBody, this.mesh);
        console.log(`PowerUp ${type} spawned.`);
    }

    update(dt) {
        if (this._destroyed) return;

        // Simple bobbing and rotating animation
        this.bobTimer += this.bobSpeed * dt;
        this.mesh.position.y = this.physicsBody.position.y + Math.sin(this.bobTimer) * this.bobAmount; // Bob relative to physics body Y
        this.mesh.rotateY(this.rotateSpeed * dt);

        // Physics body itself is static, so no position update needed here
        // Visual mesh position is synced TO the physics body position in Physics.js,
        // but we add the bobbing offset visually after the sync.
    }

    // Called by the engine's collision handler when collected
    collect(player) {
        if (this._destroyed) return;
        console.log(`PowerUp ${this.type} collected by player.`);

        // Apply the effect using the player's method (defined in Player.js)
        switch (this.type) {
            case 'heal':
                player.heal(this.config.amount || 25); // Use config amount or default
                break;
            case 'speed':
                player.applySpeedBoost(this.config.multiplier || 1.5, this.config.duration);
                break;
            case 'shield':
                 player.activateShield(this.config.duration);
                break;
            // Add cases for ammo, score, etc.
        }

        // Play collection sound/effect (engine responsibility?)
        this.destroy();
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this.mesh.visible = false;
        // Engine handles removing physics body and returning to pool
    }
}
