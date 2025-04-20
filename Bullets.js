import * as THREE from 'three';

// Optimization: Create geometry and material once, reuse for all bullets
const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 6); // Small sphere
const playerBulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow, emissive-like
const enemyBulletMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red, emissive-like

class Bullet {
    constructor(engine) {
        this.engine = engine;

        // --- Core Properties (Set by reset) ---
        this.speed = 15; // Units per second
        this.damage = 5;
        this.isPlayerBullet = true;
        this.maxLifespan = 3.0; // Seconds

        // --- State ---
        this.lifespanTimer = 0;
        this._destroyed = true; // Start inactive (in pool)

        // --- 3D Representation ---
        // Create the mesh ONCE in the constructor, reuse it
        this.mesh = new THREE.Mesh(bulletGeometry); // Use shared geometry
        this.mesh.name = "BulletMesh";
        this.mesh.visible = false; // Start invisible

        // --- Movement ---
        this.direction = new THREE.Vector3(0, 0, -1); // Normalized direction vector

        // --- Collision ---
        // Use a Sphere for simple, fast collision checks if appropriate
        // Or Box3 if you prefer boxes for everything
        this.boundingSphere = new THREE.Sphere(this.mesh.position, bulletGeometry.parameters.radius);
        // this.boundingBox = new THREE.Box3(); // Alternative if using Box3
    }

    // --- Reset (Called by Engine from Pool) ---
    reset(originPosition, direction, damage, isPlayerBullet) {
        if (!originPosition || !direction) {
            console.error("Bullet reset called without valid position or direction!");
            this.destroy(); // Mark as destroyed immediately if setup fails
            return;
        }

        // Apply properties
        this.damage = damage;
        this.isPlayerBullet = isPlayerBullet;
        // Optional: Adjust speed based on type?
        this.speed = isPlayerBullet ? 25 : 18;

        // Reset state
        this.lifespanTimer = 0;
        this._destroyed = false;

        // Set position and orientation
        this.mesh.position.copy(originPosition);
        this.direction.copy(direction).normalize(); // Store normalized direction
        // Optional: Orient the mesh if it's not symmetrical (e.g., a cone/arrow)
        // this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.direction);

        // Assign correct material
        this.mesh.material = this.isPlayerBullet ? playerBulletMaterial : enemyBulletMaterial;

        // Make visible and add to scene (Engine handles adding via getObjectFromPool)
        this.mesh.visible = true;

        // Update collision volume
        this.updateBoundingVolume();

        // console.log(`Bullet spawned: Player=${isPlayerBullet}`);
    }

    // --- Update Loop (Called by Engine) ---
    update(dt) {
        if (this._destroyed) return;

        // --- Movement ---
        const moveDistance = this.speed * dt;
        const moveVector = this.direction.clone().multiplyScalar(moveDistance);
        this.mesh.position.add(moveVector);

        // --- Lifespan Check ---
        this.lifespanTimer += dt;
        if (this.lifespanTimer >= this.maxLifespan) {
            this.destroy();
            return; // Stop further processing if destroyed
        }

        // --- Update Collision Volume ---
        this.updateBoundingVolume();

        // Optional: Add simple collision check against environment bounds?
        // if (this.mesh.position.y < 0) this.destroy(); // Hit ground
    }

    // --- Collision Volume Update ---
    updateBoundingVolume() {
        // Update sphere center
        this.boundingSphere.center.copy(this.mesh.position);

        // If using Box3:
        // this.boundingBox.setFromObject(this.mesh); // Less efficient for simple shapes
        // Or manually set from position and size:
        // const size = 0.2; // Match geometry size
        // this.boundingBox.setFromCenterAndSize(this.mesh.position, new THREE.Vector3(size, size, size));
    }

    // --- Mark for Cleanup ---
    destroy() {
        if (this._destroyed) return; // Prevent multiple calls
        this._destroyed = true;
        this.mesh.visible = false;
        // The engine's cleanupEntities will handle removing from the scene
        // and returning to the pool based on the _destroyed flag.
        // console.log("Bullet marked for destruction");
    }
}

// Export class if using modules
// export { Bullet };
