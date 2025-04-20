import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// Import other loaders as needed: FontLoader, RGBELoader, etc.

export class AssetLoader {
    constructor() {
        this.manager = new THREE.LoadingManager();
        this.gltfLoader = new GLTFLoader(this.manager);
        this.textureLoader = new THREE.TextureLoader(this.manager);
        // Add other loaders here, passing the manager

        this.models = new Map(); // Store loaded models { name: gltfScene }
        this.textures = new Map(); // Store loaded textures { name: texture }
        this.animations = new Map(); // Store animations { modelName: { animName: clip } }

        this.setupManagerCallbacks();
        console.log("AssetLoader Initialized");
    }

    setupManagerCallbacks() {
        this.manager.onStart = (url, itemsLoaded, itemsTotal) => {
            console.log(`Loading started: ${itemsLoaded}/${itemsTotal} at ${url}`);
            // Notify UI Manager (optional, can be handled by engine)
            // this.uiManager?.updateLoadingProgress(0);
        };

        this.manager.onLoad = () => {
            console.log("Loading complete!");
            // Notify engine or resolve a promise (handled by engine's preloadAssets)
        };

        this.manager.onProgress = (url, itemsLoaded, itemsTotal) => {
            const progress = (itemsLoaded / itemsTotal) * 100;
            console.log(`Loading file: ${url} (${progress.toFixed(0)}%)`);
            // Notify UI Manager
            this.engine?.uiManager?.updateLoadingProgress(progress); // Engine needs ref to UI
        };

        this.manager.onError = (url) => {
            console.error(`Loading error for: ${url}`);
            // Notify UI Manager / Engine
             this.engine?.uiManager?.showLoadingError(`Failed to load ${url}`);
        };
    }

    // --- Public Loading Methods ---

    // Method to load a list of assets defined in an array/object
    async loadAssets(assetList) {
        console.log("Starting asset loading process...");
        const loadPromises = [];

        for (const asset of assetList) {
            if (!asset.type || !asset.name || !asset.path) {
                console.warn("Skipping invalid asset definition:", asset);
                continue;
            }

            switch (asset.type.toLowerCase()) {
                case 'gltf':
                case 'glb':
                    loadPromises.push(this.loadGLTF(asset.name, asset.path));
                    break;
                case 'texture':
                    loadPromises.push(this.loadTexture(asset.name, asset.path));
                    break;
                // Add cases for 'font', 'audio', 'envmap', etc.
                default:
                    console.warn(`Unsupported asset type: ${asset.type}`);
            }
        }

        // Wait for all loading operations managed by LoadingManager to complete
        // We return a promise that resolves when onLoad fires, or rejects on error.
        return new Promise((resolve, reject) => {
             let resolved = false;
             this.manager.onLoad = () => {
                 if(!resolved) {
                     console.log("AssetLoader: All assets loaded via manager.");
                     resolved = true;
                     resolve();
                 }
             };
             // Add a more robust error handler for the promise
             const originalOnError = this.manager.onError;
             this.manager.onError = (url) => {
                  originalOnError(url); // Call original logger
                  if (!resolved) {
                      resolved = true; // Prevent resolving after rejecting
                      reject(new Error(`Failed to load asset: ${url}`));
                  }
             };

             // Handle case where there might be no assets to load
             if (loadPromises.length === 0) {
                 console.log("AssetLoader: No assets specified to load.");
                  if(!resolved) {
                     resolved = true;
                     resolve();
                 }
             }
             // Note: We don't necessarily need to await loadPromises here
             // because the manager's onLoad callback is the source of truth.
             // The promises above mainly ensure the loading process starts.
        });
    }


    async loadGLTF(name, path) {
        if (this.models.has(name)) return this.models.get(name);
        try {
            const gltf = await this.gltfLoader.loadAsync(path);
            const modelScene = gltf.scene || gltf.scenes[0]; // Get the main scene

            // Process meshes for shadows, etc.
            modelScene.traverse((child) => {
                 if (child.isMesh) {
                     child.castShadow = true;
                     child.receiveShadow = true; // Or set based on object type
                      // Optional: Optimize materials if needed
                 }
            });

            this.models.set(name, modelScene);

            // Store animations separately, keyed by model name
            if (gltf.animations && gltf.animations.length > 0) {
                const modelAnimations = {};
                gltf.animations.forEach(clip => {
                    modelAnimations[clip.name] = clip;
                });
                this.animations.set(name, modelAnimations);
                console.log(`Loaded ${gltf.animations.length} animations for model ${name}`);
            }

            console.log(`GLTF Model "${name}" loaded from ${path}`);
            return modelScene;
        } catch (error) {
            console.error(`Error loading GLTF ${name} from ${path}:`, error);
            throw error; // Re-throw to be caught by loading manager/main logic
        }
    }

    async loadTexture(name, path) {
        if (this.textures.has(name)) return this.textures.get(name);
        try {
            const texture = await this.textureLoader.loadAsync(path);
            // Configure texture properties
            texture.colorSpace = THREE.SRGBColorSpace; // Important for color textures
            texture.wrapS = THREE.RepeatWrapping; // Example wrapping
            texture.wrapT = THREE.RepeatWrapping;
            // texture.anisotropy = this.engine.renderer.instance.capabilities.getMaxAnisotropy(); // Optional: Improve texture filtering

            this.textures.set(name, texture);
            console.log(`Texture "${name}" loaded from ${path}`);
            return texture;
        } catch (error) {
            console.error(`Error loading Texture ${name} from ${path}:`, error);
            throw error;
        }
    }

    // --- Asset Access ---
    getModel(name) {
         const model = this.models.get(name);
         if (!model) {
             console.warn(`Model "${name}" not found or not loaded.`);
             return null;
         }
         // Return a clone to prevent modifying the original loaded asset directly
         // SkeletonUtils is needed for proper cloning of skinned meshes
         // return SkeletonUtils.clone(model); // Needs import: import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
         return model.clone(); // Basic clone - might not work well for skinned/animated models
     }

    getTexture(name) {
        const texture = this.textures.get(name);
        if (!texture) console.warn(`Texture "${name}" not found or not loaded.`);
        return texture; // Textures can usually be shared directly
    }

    getAnimations(modelName) {
        const anims = this.animations.get(modelName);
         if (!anims) console.warn(`Animations for model "${modelName}" not found.`);
        return anims || {}; // Return empty object if not found
    }
}
