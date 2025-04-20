import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import CannonDebugger from 'cannon-es-debugger'; // Optional debugger

export class Physics {
    constructor(engine) {
        this.engine = engine; // Reference back to the main engine if needed

        // --- Physics World Setup ---
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0); // Standard gravity
        this.world.broadphase = new CANNON.SAPBroadphase(this.world); // Efficient broadphase
        this.world.allowSleep = true; // Allow inactive bodies to sleep for performance
        this.world.solver.iterations = 10; // Solver iterations for accuracy

        // --- Materials ---
        // Define reusable physics materials
        this.materials = {
            default: new CANNON.Material('default'),
            player: new CANNON.Material('player'),
            enemy: new CANNON.Material('enemy'),
            ground: new CANNON.Material('ground'),
            bullet: new CANNON.Material('bullet'),
            powerup: new CANNON.Material('powerup')
            // Add more as needed
        };
        this.setupContactMaterials();

        // --- Body Management ---
        // Store mapping between game object IDs/refs and physics bodies
        this.bodyMap = new Map(); // Map<gameObjectUUID, CANNON.Body> or similar
        this.meshMap = new Map(); // Map<CANNON.Body, THREE.Mesh> for easy lookup during sync

        // --- Collision Event Handling ---
        this.collisionCallbacks = new Map(); // Store callbacks for specific body pairs or types

        // --- Debugger (Optional) ---
        this.debugger = null;
        // this.debugger = CannonDebugger(this.engine.renderer.scene, this.world, {
        //     color: 0x00ff00, // Wireframe color
        //     scale: 1.0,      // Adjust scale if needed
        // });

        console.log("Physics Initialized (using Cannon-es)");
    }

    setupContactMaterials() {
        const defaultProps = { friction: 0.3, restitution: 0.1 }; // Basic friction and bounce

        // Define contact behaviors between materials
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.ground, this.materials.default, { friction: 0.4, restitution: 0.1 }
        ));
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.ground, this.materials.player, { friction: 0.5, restitution: 0.0 }
        ));
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.ground, this.materials.enemy, { friction: 0.4, restitution: 0.1 }
        ));
         this.world.addContactMaterial(new CANNON.ContactMaterial( // Player vs Enemy
            this.materials.player, this.materials.enemy, { friction: 0.1, restitution: 0.1 }
        ));
         this.world.addContactMaterial(new CANNON.ContactMaterial( // Bullets should have no friction/restitution basically
            this.materials.bullet, this.materials.default, { friction: 0.0, restitution: 0.1 }
        ));
         this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.bullet, this.materials.player, { friction: 0.0, restitution: 0.1 }
        ));
         this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.bullet, this.materials.enemy, { friction: 0.0, restitution: 0.1 }
        ));
         this.world.addContactMaterial(new CANNON.ContactMaterial( // Player collects powerups
            this.materials.player, this.materials.powerup, { friction: 1.0, restitution: 0.0 } // High friction helps ensure contact event?
        ));
        // Bullets hitting ground/enemies etc. need contact materials defined if specific behavior is needed

        // Set default contact material properties (for pairs not explicitly defined)
        this.world.defaultContactMaterial.friction = defaultProps.friction;
        this.world.defaultContactMaterial.restitution = defaultProps.restitution;
    }

    // --- Update Loop (Called by Engine) ---
    update(dt) {
        // Step the physics world
        // Use a fixed timestep for stability, handling variable frame rates
        const fixedTimeStep = 1 / 60; // Simulate at 60Hz
        const maxSubSteps = 5; // Prevent spiral of death if dt is too large

        this.world.step(fixedTimeStep, dt, maxSubSteps);

        // --- Synchronize Visual Meshes with Physics Bodies ---
        this.syncMeshesToBodies();

        // --- Update Debugger (Optional) ---
        this.debugger?.update();
    }

    syncMeshesToBodies() {
        for (const [body, mesh] of this.meshMap.entries()) {
            if (mesh && body) {
                mesh.position.copy(body.position);
                mesh.quaternion.copy(body.quaternion);
            } else {
                // Clean up dangling references if one was removed improperly
                if (!body) this.meshMap.delete(body); // Should not happen if removeBody is used
            }
        }
    }


    // --- Body Management ---
    addBody(gameObject, body, mesh) {
        if (!gameObject || !body || !mesh) {
            console.error("Attempted to add invalid body/mesh to physics system", gameObject, body, mesh);
            return;
        }
        if (!gameObject.uuid) {
             console.warn("Game object added to physics lacks UUID", gameObject);
             // gameObject.uuid = THREE.MathUtils.generateUUID(); // Generate one if missing? Risky.
        }

        // Assign the corresponding game object reference to the body for collision lookup
        body.gameObject = gameObject; // Store reference directly on the body

        this.world.addBody(body);
        this.bodyMap.set(gameObject.uuid, body);
        this.meshMap.set(body, mesh);

        // Set up collision event listeners for this body
        body.addEventListener('collide', (event) => this.handleCollision(event));

        // console.log(`Physics body added for ${gameObject.constructor.name} (UUID: ${gameObject.uuid})`);
    }

    removeBody(gameObject) {
        if (!gameObject || !gameObject.uuid) return;

        const body = this.bodyMap.get(gameObject.uuid);
        if (body) {
            body.removeEventListener('collide', (event) => this.handleCollision(event)); // Clean up listener
            this.world.removeBody(body);
            this.meshMap.delete(body);
            this.bodyMap.delete(gameObject.uuid);
             // console.log(`Physics body removed for ${gameObject.constructor.name} (UUID: ${gameObject.uuid})`);
        } else {
             // console.warn(`Attempted to remove physics body for non-existent UUID: ${gameObject.uuid}`);
        }
    }

    getBody(gameObject) {
        return gameObject ? this.bodyMap.get(gameObject.uuid) : null;
    }

    // --- Collision Handling ---
    handleCollision(event) {
        const bodyA = event.body;
        const bodyB = event.contact.bi; // The other body involved in the contact

        const objectA = bodyA?.gameObject; // Get associated game object
        const objectB = bodyB?.gameObject;

        if (objectA && objectB) {
            // Notify the main engine or directly call methods on objects
             this.engine.handleCollisionEvent(objectA, objectB, event);
        } else {
             // Collision involves a body without a linked game object (or static body?)
             // console.warn("Collision detected involving body without game object link.", event);
        }
    }

    // --- Raycasting ---
    raycast(from, to, result = new CANNON.RaycastResult(), options = {}) {
        return this.world.raycastClosest(from, to, options, result);
    }

    // --- Utility ---
    createBoxShape(sizeVec3) {
        // Cannon dimensions are half-extents
        return new CANNON.Box(new CANNON.Vec3(sizeVec3.x / 2, sizeVec3.y / 2, sizeVec3.z / 2));
    }

    createSphereShape(radius) {
        return new CANNON.Sphere(radius);
    }

    createCapsuleShape(radius, height) {
        // Cannon-es doesn't have a built-in capsule. Approximate with sphere + cylinder + sphere
        // Or use compound shapes. For simplicity, often approximate with a slightly larger sphere or box.
        // Or use a cylinder (though its collision is less capsule-like)
         console.warn("Capsule shape requested, using Cylinder approximation in Physics.");
         // Cylinder parameters: radiusTop, radiusBottom, height, numSegments
         return new CANNON.Cylinder(radius, radius, height, 12);
        // Proper capsule requires Compound shape:
        // const shape = new CANNON.Compound();
        // const sphere = new CANNON.Sphere(radius);
        // const cylinderHeight = height - 2 * radius;
        // const cylinder = new CANNON.Cylinder(radius, radius, cylinderHeight, 12);
        // const halfCylHeight = cylinderHeight / 2;
        // shape.addChild(sphere, new CANNON.Vec3(0, halfCylHeight, 0));
        // shape.addChild(cylinder, new CANNON.Vec3(0, 0, 0), new CANNON.Quaternion().setFromEuler(Math.PI / 2, 0, 0)); // Orient cylinder correctly
        // shape.addChild(sphere, new CANNON.Vec3(0, -halfCylHeight, 0));
        // return shape;
    }

    createMaterial(materialName) {
        return this.materials[materialName] || this.materials.default;
    }

}
