import * as THREE from 'three';
// Optional: Import specific controls or utils if needed

class Player {
    constructor(engine) {
        this.engine = engine; // Reference to the main engine

        // --- Core Properties ---
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.baseSpeed = 5.0; // Units per second
        this.speedMultiplier = 1.0; // For power-ups
        this.turnSpeed = Math.PI * 1.5; // Radians per second for keyboard turning (if not using mouse look primarily)
        this.attack = 10; // Base damage for bullets
        this.shootCooldown = 0.2; // Seconds between shots
        this.shootTimer = 0;
        this.config = { // Can be expanded with loaded config
            size: new THREE.Vector3(0.8, 1.8, 0.8), // Width, Height, Depth for bounding box / placeholder mesh
            eyeHeight: 1.6 // For first-person camera attachment
        };

        // --- State ---
        this.isInvincible = false;
        this.invincibilityTimer = 0;
        this.invincibilityDuration = 1000; // ms
        this.isShielded = false;
        this.shieldTimer = 0;
        this._destroyed = false; // Flag for engine cleanup (player usually not pooled/destroyed)
        this.activePowerUps = new Map(); // { type: { timer, removeEffect } }

        // --- 3D Representation ---
        this.mesh = this.createPlaceholderMesh(); // Replace with model loading later
        this.mesh.name = "PlayerMesh";
        this.mesh.position.set(0, this.config.size.y / 2, 0); // Position base at ground level
        // Optional: Configure shadows
        // this.mesh.castShadow = true;
        // this.mesh.receiveShadow = false; // Usually players don't receive shadows on themselves

        // Provides rotation separate from visual mesh if needed (e.g., for physics body)
        this.orientation = new THREE.Quaternion();
        this.mesh.quaternion.copy(this.orientation);

        // --- Movement ---
        this.velocity = new THREE.Vector3(); // Current movement velocity
        this.moveDirection = new THREE.Vector3(); // Intended direction based on input
        this.forwardDirection = new THREE.Vector3(0, 0, -1); // Local forward vector, updated by rotation

        // --- Collision ---
        this.boundingBox = new THREE.Box3();
        this.updateBoundingBox(); // Initial calculation

        // --- Animation ---
        this.mixer = null; // Initialize if using animated models: new THREE.AnimationMixer(this.mesh);
        this.animations = {}; // Store animation clips: { 'idle': clip, 'run': clip }
        this.currentAction = null; // Reference to the currently playing animation action

        // --- Camera Attachment Point (For First-Person) ---
        this.cameraTarget = new THREE.Object3D();
        this.cameraTarget.position.set(0, this.config.eyeHeight, 0.1); // Position slightly forward from center
        this.mesh.add(this.cameraTarget); // Attach to player mesh

        // Add player mesh to the scene immediately
        this.engine.scene.add(this.mesh);
        console.log("Player initialized.");
    }

    createPlaceholderMesh() {
        // Replace this with actual model loading using engine.gltfLoader etc.
        const geometry = new THREE.CapsuleGeometry(this.config.size.x / 2, this.config.size.y - this.config.size.x, 8, 16);
        // Use MeshStandardMaterial for realistic lighting
        const material = new THREE.MeshStandardMaterial({
            color: 0x0077ff,
            roughness: 0.6,
            metalness: 0.2,
            // map: texture, // Add textures loaded via engine.textureLoader
        });
        const mesh = new THREE.Mesh(geometry, material);
        // Ensure capsule bottom is at y=0
        mesh.geometry.translate(0, (this.config.size.y - this.config.size.x) / 2 + this.config.size.x / 2, 0);
        return mesh;
    }

    // --- Update Loop (Called by Engine) ---
    update(dt, inputState) {
        if (this._destroyed) return;

        this.updateInput(dt, inputState);
        this.applyMovement(dt);
        this.updateTimers(dt);
        this.updateAnimation(dt); // Update animation mixer
        this.updateBoundingBox();

        // Reset shoot timer (can be done here or in shooting logic)
        if (this.shootTimer > 0) {
            this.shootTimer -= dt;
        }

        // Attempt to shoot based on input state
        if (inputState.shoot && this.shootTimer <= 0) {
            this.shoot();
        }
    }

    // --- Input Processing ---
    updateInput(dt, inputState) {
        this.moveDirection.set(0, 0, 0); // Reset direction each frame

        // Calculate movement direction based on input relative to player's forward
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.orientation);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.orientation);

        if (inputState.forward) this.moveDirection.add(forward);
        if (inputState.backward) this.moveDirection.sub(forward);
        if (inputState.left) this.moveDirection.sub(right);
        if (inputState.right) this.moveDirection.add(right);

        this.moveDirection.normalize(); // Ensure consistent speed regardless of diagonal movement

        // --- Handle Rotation (Mouse Look is primary, Keyboard is fallback/additive) ---
        // Mouse look rotation is applied directly to the mesh in the engine's updateInputState
        // We just need to update our internal orientation quaternion to match the mesh's
        this.orientation.copy(this.mesh.quaternion);

        // Update our local forward direction vector based on the new orientation
        this.mesh.getWorldDirection(this.forwardDirection);


        // Optional: Keyboard turning (if not using mouse look or for accessibility)
        // if (inputState.turnLeft) this.rotatePlayer(this.turnSpeed * dt);
        // if (inputState.turnRight) this.rotatePlayer(-this.turnSpeed * dt);

    }

    // --- Movement Application ---
    applyMovement(dt) {
        const currentSpeed = this.baseSpeed * this.speedMultiplier;
        const moveVector = this.moveDirection.clone().multiplyScalar(currentSpeed * dt);

        // TODO: Integrate with physics engine here for collision response
        // If using physics: body.velocity = moveDirection * currentSpeed;

        // Simple movement (without physics):
        // Optional: Add simple world boundary checks
        const nextPos = this.mesh.position.clone().add(moveVector);
        const playArea = 50; // Example boundary
        if (Math.abs(nextPos.x) < playArea && Math.abs(nextPos.z) < playArea) {
             this.mesh.position.add(moveVector);
        }

        // Update camera position (if using third-person) - Engine handles this now
    }

    // --- Rotation ---
    rotatePlayer(angle) { // Angle in radians
        const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        this.orientation.multiplyQuaternions(rotationQuaternion, this.orientation); // Pre-multiply for local rotation
        this.mesh.quaternion.copy(this.orientation); // Update visual mesh
    }

    // --- Actions ---
    shoot() {
        if (this._destroyed) return;

        this.shootTimer = this.shootCooldown; // Reset cooldown

        // Calculate bullet spawn position (e.g., from camera position or weapon muzzle)
        // Use the cameraTarget or a dedicated muzzle point if you have one
        const spawnOffset = new THREE.Vector3(0, 0, -0.5); // Slightly in front of player center/camera target
        const spawnPos = this.cameraTarget.getWorldPosition(new THREE.Vector3()).add(
             spawnOffset.applyQuaternion(this.mesh.quaternion) // Offset relative to player rotation
        );


        // Use the player's current forward direction
        const direction = this.forwardDirection.clone();

        // Tell the engine to spawn a bullet
        this.engine.spawnBullet(spawnPos, direction, this.attack, true); // isPlayerBullet = true

        // Optional: Play shooting animation
        // this.playAnimation('shoot', 0.1); // Play once, short duration
    }

    // --- Health & Damage ---
    takeDamage(amount) {
        if (this.isInvincible || this.isShielded || this._destroyed) {
             if(this.isShielded){
                // Optional: Visual feedback for shield hit
                console.log("Shield blocked damage");
             }
            return 0; // No damage taken
        }

        this.health = Math.max(0, this.health - amount); // Apply damage (add defense calculation if needed)
        console.log(`Player took ${amount} damage, health: ${this.health}`);

        this.applyInvincibility(this.invincibilityDuration);
        this.showDamageEffect(); // Visual feedback

        if (this.health <= 0) {
            this.die();
        }
        return amount; // Return actual damage taken
    }

    heal(amount) {
        if (this._destroyed) return;
        this.health = Math.min(this.maxHealth, this.health + amount);
        console.log(`Player healed ${amount}, health: ${this.health}`);
        // Optional: Healing visual effect
    }

    die() {
        if (this._destroyed) return;
        console.log("Player Died");
        this._destroyed = true;
        // Optional: Play death animation
        // this.playAnimation('death', 0, false); // Play once, don't loop
        this.engine.endGame(); // Notify engine
    }

    applyInvincibility(duration) {
        this.isInvincible = true;
        this.invincibilityTimer = duration;
    }

    showDamageEffect() {
        // Placeholder: Flash the material red briefly
        if (!this.mesh || !this.mesh.material) return;
        const originalColor = this.mesh.material.color.clone();
        this.mesh.material.color.set(0xff0000); // Red
        this.mesh.material.emissive?.set(0x550000); // Optional emissive flash

        setTimeout(() => {
             if (this.mesh && this.mesh.material) { // Check if mesh still exists
                 this.mesh.material.color.copy(originalColor);
                  this.mesh.material.emissive?.set(0x000000); // Reset emissive
             }
        }, 100); // Flash duration
    }


    // --- Power Ups ---
    applySpeedBoost(multiplier, duration) {
        this.speedMultiplier = Math.max(this.speedMultiplier, multiplier); // Apply strongest boost
        this.setPowerUpTimer('speed', duration, () => {
            // This remove function might need adjustment if multiple speed boosts could overlap
            this.speedMultiplier = 1.0; // Reset to base when timer ends
            console.log("Speed boost expired");
        });
    }

    activateShield(duration) {
        this.isShielded = true;
        // Optional: Add visual shield effect mesh as child of player mesh
        // this.mesh.add(this.shieldEffectMesh);
        this.setPowerUpTimer('shield', duration, () => {
             this.isShielded = false;
            // Optional: Remove visual shield effect mesh
            // this.mesh.remove(this.shieldEffectMesh);
             console.log("Shield expired");
        });
    }

    setPowerUpTimer(type, duration, removeEffectCallback) {
        const now = performance.now();
        const endTime = now + duration;
        const existing = this.activePowerUps.get(type);

        // If existing timer, clear its specific removal timeout and update end time
        if (existing && existing.timeoutId) {
            clearTimeout(existing.timeoutId);
        }

        const timeoutId = setTimeout(() => {
            removeEffectCallback();
            this.activePowerUps.delete(type);
        }, duration);

        this.activePowerUps.set(type, { endTime: endTime, timeoutId: timeoutId });
        console.log(`PowerUp ${type} applied. Ends in ${duration / 1000}s`);
    }

    // --- Utility & Updates ---
    updateTimers(dt) {
        const deltaMillis = dt * 1000;

        // Invincibility
        if (this.isInvincible) {
            this.invincibilityTimer -= deltaMillis;
            if (this.invincibilityTimer <= 0) {
                this.isInvincible = false;
                // Optional: Stop flashing effect if one was active
            }
        }

        // Note: Power-up timers are handled by setTimeout now for simplicity,
        // but could also be managed here for pause-ability.
    }

    updateBoundingBox() {
        // Ensure the box accurately reflects the mesh's current world state
        this.boundingBox.setFromObject(this.mesh);
    }

    // --- Animation Control ---
    updateAnimation(dt) {
        if (this.mixer) {
            this.mixer.update(dt);

            // --- Example State-Based Animation Switching ---
            let targetAnimation = 'idle'; // Default animation
            if (this.moveDirection.lengthSq() > 0.01) { // Check if moving significantly
                targetAnimation = 'run';
            }
             // Add checks for jumping, shooting, dying etc.

            // this.playAnimation(targetAnimation); // Call helper to switch smoothly
        }
    }

    playAnimation(name, crossfadeDuration = 0.2, loop = true) {
        if (!this.mixer || !this.animations[name] || this.currentAction === this.animations[name]) {
            return; // No mixer, animation missing, or already playing
        }

        const newAction = this.mixer.clipAction(this.animations[name]);
        newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        newAction.clampWhenFinished = !loop; // Important for non-looping anims

        if (this.currentAction) {
            // Smoothly fade from current action to new action
            this.currentAction.crossFadeTo(newAction, crossfadeDuration, true); // true = warp timing
        }

        newAction.enabled = true;
        newAction.play();
        this.currentAction = newAction;
    }


    // --- Cleanup (If player were ever destroyed/removed) ---
    destroy() {
        console.log("Destroying Player");
        this._destroyed = true;
        // Stop animations
        if (this.mixer) this.mixer.stopAllAction();
        // Remove mesh from scene (engine might also do this)
        this.engine.scene.remove(this.mesh);
        // Clear any active timeouts for powerups
        this.activePowerUps.forEach(p => clearTimeout(p.timeoutId));
        this.activePowerUps.clear();
    }
}

// Export class if using modules
// export { Player };
