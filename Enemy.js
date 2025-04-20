import * as THREE from 'three';

// --- Enemy States (Finite State Machine) ---
const EnemyState = {
    IDLE: 'idle',
    CHASING: 'chasing',
    ATTACKING: 'attacking', // Could be split into RANGED_ATTACKING / MELEE_ATTACKING
    FLEEING: 'fleeing', // Optional state
    DYING: 'dying',
    INACTIVE: 'inactive' // State while in pool
};

class Enemy {
    constructor(engine) {
        this.engine = engine;

        // Properties set by reset()
        this.type = null;
        this.config = null;
        this.health = 0;
        this.speed = 0;
        this.score = 0;
        this.collisionDamage = 0;
        this.dropChance = 0;
        this.canShoot = false;
        this.shootingInterval = Infinity;
        this.shootDistance = Infinity;
        this.chaseDistance = Infinity;

        // --- State ---
        this.currentState = EnemyState.INACTIVE;
        this.stateTimer = 0; // Timer for state-specific durations
        this._destroyed = true; // Start as destroyed (inactive in pool)
        this.isInvincible = false; // Short invincibility after taking damage
        this.invincibilityTimer = 0;
        this.invincibilityDuration = 300; // ms

        // --- 3D Representation ---
        this.mesh = this.createPlaceholderMesh(); // Will be customized in reset()
        this.mesh.name = "EnemyMesh"; // Set in reset() with type
        // Optional: Shadows
        // this.mesh.castShadow = true;
        // this.mesh.receiveShadow = true;

        // --- Movement & AI ---
        this.velocity = new THREE.Vector3();
        this.targetPosition = new THREE.Vector3(); // For pathfinding or chasing
        this.forwardDirection = new THREE.Vector3(0, 0, -1); // Local forward
        this.shootTimer = 0;

        // --- Collision ---
        this.boundingBox = new THREE.Box3();

        // --- Animation ---
        this.mixer = null; // new THREE.AnimationMixer(this.mesh);
        this.animations = {}; // { 'idle': clip, 'run': clip, 'attack': clip, 'death': clip }
        this.currentAction = null;
    }

    createPlaceholderMesh() {
        // Basic geometry, will be customized in reset
        const geometry = new THREE.BoxGeometry(1, 1, 1); // Will be scaled in reset
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.8 });
        return new THREE.Mesh(geometry, material);
    }

    // --- Reset (Called by Engine when spawning from pool) ---
    reset(type, config, position) {
        this.type = type;
        this.config = config;
        this.mesh.name = `EnemyMesh_${type}`;

        // Apply config stats
        this.health = config.health;
        this.speed = config.speed;
        this.score = config.score;
        this.collisionDamage = config.collisionDamage;
        this.dropChance = config.dropChance || 0.05; // Default drop chance
        this.canShoot = config.canShoot || false;
        this.shootingInterval = config.shootingInterval || Infinity;
        this.shootDistance = config.shootDistance || 5; // Default shoot distance
        this.chaseDistance = config.chaseDistance || 25; // Default chase distance

        // Reset state
        this.isInvincible = false;
        this.invincibilityTimer = 0;
        this.shootTimer = Math.random() * this.shootingInterval; // Stagger initial shots
        this._destroyed = false;

        // Customize appearance based on type
        this.customizeMesh(type, config);

        // Set position and rotation
        this.mesh.position.copy(position);
        this.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0); // Random initial facing
        this.mesh.getWorldDirection(this.forwardDirection); // Update forward vector

        // Reset animation state
        if (this.mixer) this.mixer.stopAllAction();
        this.currentAction = null;

        // Initial state transition
        this.setState(EnemyState.IDLE);

        this.updateBoundingBox(); // Calculate initial bounding box
        console.log(`Enemy ${type} spawned at ${position.x.toFixed(1)}, ${position.z.toFixed(1)}`);
    }

    customizeMesh(type, config) {
        // --- Replace with model loading or more distinct geometry/materials ---
        const size = config.size || 1;
        this.mesh.scale.set(size, size, size); // Adjust scale based on config

        if (!this.mesh.material) { // Ensure material exists
             this.mesh.material = new THREE.MeshStandardMaterial();
        }

        // Example: Set color based on type
        switch (type) {
            case 'basic': this.mesh.material.color.set(0xff0000); break; // Red
            case 'tank': this.mesh.material.color.set(0x0000ff); break; // Blue
            case 'fast': this.mesh.material.color.set(0x00ff00); break; // Green
            case 'shooter': this.mesh.material.color.set(0x800080); break; // Purple
            default: this.mesh.material.color.set(0x888888); // Grey fallback
        }
        this.mesh.material.needsUpdate = true; // Important if changing material props
    }

    // --- Update Loop ---
    update(dt) {
        if (this._destroyed || this.currentState === EnemyState.INACTIVE) return;

        this.updateTimers(dt);
        this.updateFSM(dt); // Run state logic and transitions
        this.updateAnimation(dt);
        this.updateBoundingBox();
    }

    // --- Finite State Machine (FSM) ---
    setState(newState) {
        if (newState === this.currentState) return;

        // Exit logic for the old state
        switch (this.currentState) {
            // Add exit logic if needed (e.g., stop specific timers)
        }

        console.log(`Enemy ${this.type} changing state: ${this.currentState} -> ${newState}`);
        this.currentState = newState;
        this.stateTimer = 0; // Reset state timer

        // Entry logic for the new state
        switch (newState) {
            case EnemyState.IDLE:
                this.velocity.set(0, 0, 0);
                this.playAnimation('idle');
                this.stateTimer = 1 + Math.random() * 2; // Idle for 1-3 seconds
                break;
            case EnemyState.CHASING:
                this.playAnimation('run');
                break;
            case EnemyState.ATTACKING:
                this.velocity.set(0, 0, 0); // Stop moving to attack (usually)
                this.playAnimation('attack');
                 // Reset shoot timer for shooters to potentially fire quickly
                 if (this.canShoot) this.shootTimer = Math.min(this.shootTimer, 0.5);
                break;
            case EnemyState.DYING:
                this.velocity.set(0, 0, 0);
                this.playAnimation('death', 0.1, false); // Play death anim once
                this.stateTimer = 1.5; // Time for death animation before removal
                // Disable further damage/collisions conceptually
                break;
            case EnemyState.INACTIVE:
                 this.velocity.set(0, 0, 0);
                 if (this.mixer) this.mixer.stopAllAction();
                 break;
        }
    }

    updateFSM(dt) {
        if (!this.engine.player || this.engine.player._destroyed) {
            // No player target, revert to idle or inactive
            if(this.currentState !== EnemyState.IDLE && this.currentState !== EnemyState.DYING && this.currentState !== EnemyState.INACTIVE) {
                this.setState(EnemyState.IDLE);
            }
            // Don't run further logic if idle/dying/inactive without player
             if(this.currentState === EnemyState.IDLE || this.currentState === EnemyState.DYING || this.currentState === EnemyState.INACTIVE) {
                 this.stateTimer -= dt;
                 if(this.currentState === EnemyState.DYING && this.stateTimer <= 0) this.destroy();
                 return; // Only process timer for these states if no player
             }
        }


        this.stateTimer -= dt;
        const playerMesh = this.engine.player.mesh;
        const distanceToPlayerSq = this.mesh.position.distanceToSquared(playerMesh.position);

        // --- State Logic Execution ---
        switch (this.currentState) {
            case EnemyState.IDLE:
                // Simple wander or stand still
                if (this.stateTimer <= 0) {
                    // Decide to wander or stay put again
                    this.stateTimer = 1 + Math.random() * 2;
                    // Optional: Add wandering logic here (pick random direction, move briefly)
                }
                break;

            case EnemyState.CHASING:
                // Move towards player
                this.targetPosition.copy(playerMesh.position);
                const directionToPlayer = this.targetPosition.clone().sub(this.mesh.position).normalize();

                // Smoothly look towards player
                 const targetQuaternion = new THREE.Quaternion();
                 const lookAtMatrix = new THREE.Matrix4().lookAt(this.mesh.position, this.targetPosition, this.mesh.up);
                 targetQuaternion.setFromRotationMatrix(lookAtMatrix);
                 this.mesh.quaternion.slerp(targetQuaternion, 0.1); // Adjust slerp factor for turn speed

                // Move forward
                this.mesh.getWorldDirection(this.forwardDirection); // Update forward based on new rotation
                const moveVector = this.forwardDirection.multiplyScalar(this.speed * dt);
                // TODO: Physics integration or simple move
                 this.mesh.position.add(moveVector);

                break;

            case EnemyState.ATTACKING:
                 // Face player
                 this.targetPosition.copy(playerMesh.position);
                 this.mesh.lookAt(this.targetPosition); // Snap lookAt while attacking

                 if (this.canShoot) {
                     this.shootTimer -= dt;
                     if (this.shootTimer <= 0) {
                         this.shoot();
                         this.shootTimer = this.shootingInterval;
                     }
                 } else {
                    // Melee attack logic (handled by engine collision for now)
                    // Could trigger attack animation timer here
                 }
                break;

            case EnemyState.DYING:
                 // Animation plays, timer counts down
                 if (this.stateTimer <= 0) {
                     this.destroy(); // Mark for cleanup
                 }
                 break;

             case EnemyState.INACTIVE:
                 // Do nothing
                 break;
        }

        // --- State Transition Checks (only if not dying/inactive) ---
        if (this.currentState !== EnemyState.DYING && this.currentState !== EnemyState.INACTIVE) {
             const canAttack = distanceToPlayerSq <= (this.shootDistance * this.shootDistance);
             const canChase = distanceToPlayerSq <= (this.chaseDistance * this.chaseDistance);

             switch (this.currentState) {
                 case EnemyState.IDLE:
                     if (canChase) this.setState(EnemyState.CHASING);
                     break;
                 case EnemyState.CHASING:
                     if (canAttack) this.setState(EnemyState.ATTACKING);
                     else if (!canChase) this.setState(EnemyState.IDLE); // Player got away
                     break;
                 case EnemyState.ATTACKING:
                     if (!canAttack) this.setState(EnemyState.CHASING); // Player moved out of range
                     break;
             }
         }
    }

    // --- Actions ---
    shoot() {
        if (this._destroyed || !this.engine.player || this.engine.player._destroyed) return;

        // Calculate spawn position (e.g., front of enemy mesh)
        const spawnOffset = new THREE.Vector3(0, 0.5, -0.6 * (this.config.size || 1)); // Adjust Z offset based on size
        const spawnPos = this.mesh.localToWorld(spawnOffset.clone()); // Use localToWorld

        // Calculate direction towards player center
        const playerTargetPos = this.engine.player.mesh.position.clone().add(new THREE.Vector3(0, this.engine.player.config.size.y / 2, 0)); // Aim center mass
        const direction = playerTargetPos.sub(spawnPos).normalize();

        // Use engine to spawn bullet
        this.engine.spawnBullet(spawnPos, direction, this.config.attack || 5, false); // isPlayerBullet = false

        // Optional: Play shoot animation/effect
    }

    // --- Health & Damage ---
    takeDamage(amount) {
        if (this.isInvincible || this._destroyed || this.currentState === EnemyState.DYING || this.currentState === EnemyState.INACTIVE) {
            return 0;
        }

        // Apply defense if implemented: amount = Math.max(1, amount - (this.config.defense || 0));
        this.health = Math.max(0, this.health - amount);
        console.log(`Enemy ${this.type} took ${amount} damage, health: ${this.health}`);

        this.applyInvincibility(this.invincibilityDuration);
        this.showDamageEffect();

        if (this.health <= 0) {
            this.setState(EnemyState.DYING);
        }
        return amount; // Return actual damage taken
    }

     applyInvincibility(duration) {
        this.isInvincible = true;
        this.invincibilityTimer = duration;
    }

     showDamageEffect() {
        // Placeholder: Simple color flash
         if (!this.mesh || !this.mesh.material || this.currentState === EnemyState.DYING) return;
         const originalColor = this.mesh.material.color.clone();
         this.mesh.material.color.set(0xffffff); // White flash

         setTimeout(() => {
             if (this.mesh && this.mesh.material && this.currentState !== EnemyState.DYING) {
                 // Restore color based on type (might need to store original type color)
                 this.customizeMesh(this.type, this.config);
             }
         }, 80); // Shorter flash for enemies
     }

    // --- Utility & Updates ---
    updateTimers(dt) {
        const deltaMillis = dt * 1000;
        if (this.isInvincible) {
            this.invincibilityTimer -= deltaMillis;
            if (this.invincibilityTimer <= 0) {
                this.isInvincible = false;
            }
        }
    }

    updateBoundingBox() {
        // Can be slightly expensive, maybe optimize later if needed
        this.boundingBox.setFromObject(this.mesh);
    }

    // --- Animation ---
     updateAnimation(dt) {
        if (this.mixer) {
            this.mixer.update(dt);
        }
    }

     playAnimation(name, crossfadeDuration = 0.2, loop = true) {
        // Identical logic to Player's playAnimation method
        if (!this.mixer || !this.animations[name] || this.currentAction === this.animations[name]) return;
        const newAction = this.mixer.clipAction(this.animations[name]);
        newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        newAction.clampWhenFinished = !loop;
        if (this.currentAction) {
            this.currentAction.crossFadeTo(newAction, crossfadeDuration, true);
        }
        newAction.enabled = true;
        newAction.play();
        this.currentAction = newAction;
    }

    // --- Cleanup ---
    destroy() {
        // Called internally when health <= 0 and death animation finishes, or by engine cleanup
        if (this._destroyed) return; // Prevent double destroy calls
        this._destroyed = true;
        this.setState(EnemyState.INACTIVE); // Ensure state is inactive
        console.log(`Enemy ${this.type} marked for destruction.`);
        // Engine handles removal from scene and pooling in its cleanup phase
    }
}

// Export class if using modules
// export { Enemy };
