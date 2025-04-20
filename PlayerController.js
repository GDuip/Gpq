import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class PlayerController {
    constructor(engine) {
        this.engine = engine;
        this.input = engine.inputState; // Direct reference to input state
        this.player = engine.player;   // Reference to the player object
        this.physics = engine.physics; // Reference to physics system
        this.camera = engine.renderer.camera; // Reference to the camera
        this.weaponManager = engine.weaponManager; // Reference to weapon manager

        // --- Configuration ---
        this.lookSensitivity = 0.0025;
        this.moveForceFactor = 50; // Adjust force applied for movement
        this.maxSpeed = 5; // Maximum velocity magnitude player should reach
        this.jumpForce = 15; // Upward force for jumping
        this.airControlFactor = 0.3; // How much control player has while airborne

        // --- State ---
        this.canJump = true; // Track if player is grounded
        this.accumulatedRotation = new THREE.Quaternion(); // Store orientation changes

        this.setupCollisionListener();
        console.log("PlayerController Initialized");
    }

    setupCollisionListener() {
        // Listen for collisions involving the player's physics body
        const playerBody = this.physics.getBody(this.player);
        if (playerBody) {
            playerBody.addEventListener('collide', (event) => this.handleCollision(event));
        } else {
            console.warn("PlayerController could not find player physics body to attach collision listener.");
        }
    }

    handleCollision(event) {
        // Basic ground check: Check if contact normal is mostly pointing upwards
        const contactNormal = new CANNON.Vec3();
        const upAxis = new CANNON.Vec3(0, 1, 0);
        let touchingGround = false;

        // Check all contact points in the collision event
        for (const contact of event.contacts) {
            // Check normal direction against the player body (event.target is the player body here)
            if (contact.bi.id === event.target.id) { // Normal is relative to body A (contact.bi)
                contact.ni.negate(contactNormal); // Negate normal for body B (player)
            } else {
                contactNormal.copy(contact.ni); // Normal is relative to body A (the other object)
            }

            // Check if the collision normal is mostly upwards (dot product > threshold)
            if (contactNormal.dot(upAxis) > 0.5) {
                touchingGround = true;
                break; // Found ground contact, no need to check further
            }
        }

        if (touchingGround) {
            this.canJump = true;
            // console.log("Player grounded");
        }
    }

    update(dt) {
        if (!this.player || this.player._destroyed) return;

        const playerBody = this.physics.getBody(this.player);
        if (!playerBody) return; // No physics body, can't control

        // --- Aiming / Rotation ---
        if (this.input.mouse.isPointerLocked) {
            const deltaX = this.input.aimDelta.x * this.lookSensitivity;
            const deltaY = this.input.aimDelta.y * this.lookSensitivity;

            // Rotate body around Y axis (horizontal look) using quaternion math
            const rotY = new CANNON.Quaternion();
            rotY.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -deltaX);
            playerBody.quaternion = rotY.mult(playerBody.quaternion); // Multiply existing orientation

            // Vertical look: Rotate the camera directly (often preferred over rotating physics body)
            // Clamp vertical rotation
            const currentXRot = this.camera.rotation.x;
            const desiredXRot = currentXRot - deltaY;
            this.camera.rotation.x = THREE.MathUtils.clamp(desiredXRot, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1); // Clamp with small margin

            // Update player's visual mesh orientation to match physics (done in Physics sync step)
            // Update player's internal forward direction vector
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.player.mesh.quaternion); // Get world direction from visual mesh
            this.player.forwardDirection.copy(forward);

        } else {
            // Handle keyboard turning if pointer isn't locked (optional)
        }


        // --- Movement ---
        const moveDirectionWorld = new THREE.Vector3();
        const forward = new THREE.Vector3();
        playerBody.quaternion.vmult(new CANNON.Vec3(0, 0, -1), forward); // Get forward vector from physics body
        const right = new THREE.Vector3();
        playerBody.quaternion.vmult(new CANNON.Vec3(1, 0, 0), right); // Get right vector

        if (this.input.actions.forward) moveDirectionWorld.add(forward);
        if (this.input.actions.backward) moveDirectionWorld.sub(forward);
        if (this.input.actions.left) moveDirectionWorld.sub(right);
        if (this.input.actions.right) moveDirectionWorld.add(right);

        moveDirectionWorld.y = 0; // Keep movement horizontal relative to player orientation
        moveDirectionWorld.normalize();

        const effectiveMoveForce = this.moveForceFactor * (this.canJump ? 1.0 : this.airControlFactor);
        const force = moveDirectionWorld.scale(effectiveMoveForce);

        // Apply force - Apply impulse for more responsive control, especially air control
        // playerBody.applyForce(force, playerBody.position); // Less responsive
        playerBody.applyImpulse(force.scale(dt), CANNON.Vec3.ZERO); // Apply impulse scaled by dt

        // --- Speed Clamping ---
        // Clamp horizontal velocity to maxSpeed
        const currentVelocity = playerBody.velocity;
        const horizontalVelocity = new CANNON.Vec3(currentVelocity.x, 0, currentVelocity.z);
        const horizontalSpeedSq = horizontalVelocity.lengthSquared();

        if (horizontalSpeedSq > this.maxSpeed * this.maxSpeed) {
            const horizontalSpeed = Math.sqrt(horizontalSpeedSq);
            const correctionFactor = this.maxSpeed / horizontalSpeed;
            playerBody.velocity.x *= correctionFactor;
            playerBody.velocity.z *= correctionFactor;
             // console.log("Clamping speed");
        }

        // --- Jumping ---
        if (this.input.actions.jump && this.canJump) {
            playerBody.velocity.y = this.jumpForce; // Apply upward velocity directly
            // playerBody.applyImpulse(new CANNON.Vec3(0, this.jumpForce, 0), CANNON.Vec3.ZERO); // Alternative: impulse jump
            this.canJump = false; // Prevent double jumps until grounded again
            console.log("Player Jumped");
        }

        // --- Shooting ---
        if (this.input.actions.shootPressed || (this.input.actions.shoot && this.weaponManager.canAutoFire())) {
            const fired = this.weaponManager.fire();
            // Optionally trigger player shoot animation if fire was successful
            // if (fired) this.player.playAnimation('shoot', 0.1);
        }

        // --- Weapon Switching ---
        if (this.input.actions.switchWeaponNext) {
            this.weaponManager.switchToNextWeapon();
        }
        if (this.input.actions.switchWeaponPrev) {
            this.weaponManager.switchToPreviousWeapon();
        }

        // --- Update Player's internal state based on physics ---
        this.player.velocity.copy(playerBody.velocity); // Keep player object velocity synced

        // Update player's visual mesh orientation (the sync step in Physics.js handles this)
        // this.player.mesh.quaternion.copy(playerBody.quaternion);
    }
}
