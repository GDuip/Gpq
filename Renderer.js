import * as THREE from 'three';
// Optional: Import post-processing passes if used
// import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
// import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
// import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;

        // --- Core Components ---
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75, // FOV
            window.innerWidth / window.innerHeight, // Aspect Ratio
            0.1, // Near plane
            1000 // Far plane
        );
        this.instance = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false // Performance improvement if you don't need transparency
        });

        // --- Configuration ---
        this.instance.setSize(window.innerWidth, window.innerHeight);
        this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.instance.outputColorSpace = THREE.SRGBColorSpace; // Correct color space
        this.instance.toneMapping = THREE.ACESFilmicToneMapping; // Improved tone mapping
        this.instance.toneMappingExposure = 1.0;

        // --- Shadows (Enable if needed) ---
        this.instance.shadowMap.enabled = true; // Enable shadows globally
        this.instance.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows are generally nicer

        // --- Lighting ---
        this.setupLighting();

        // --- Post Processing (Optional) ---
        // this.composer = new EffectComposer(this.instance);
        // this.setupPostProcessing();

        console.log("Renderer Initialized");
    }

    setupLighting() {
        // Ambient light provides overall illumination
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Adjust intensity
        this.scene.add(ambientLight);

        // Directional light simulates sun/moon
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); // Adjust intensity
        directionalLight.position.set(15, 30, 20); // Adjust position/angle
        directionalLight.castShadow = true; // Allow this light to cast shadows

        // Configure shadow properties for quality/performance balance
        directionalLight.shadow.mapSize.width = 2048; // Higher resolution shadows
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 100;
        // Adjust the shadow camera frustum size to fit your scene tightly
        directionalLight.shadow.camera.left = -40;
        directionalLight.shadow.camera.right = 40;
        directionalLight.shadow.camera.top = 40;
        directionalLight.shadow.camera.bottom = -40;
        directionalLight.shadow.bias = -0.001; // Helps prevent shadow acne

        this.scene.add(directionalLight);
        // Optional: Add helper to visualize shadow camera
        // const shadowCamHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
        // this.scene.add(shadowCamHelper);
        // Optional: Add helper to visualize light direction
        // const dirLightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
        // this.scene.add(dirLightHelper);

         // Optional: Add a subtle hemisphere light for softer ambient lighting
         const hemisphereLight = new THREE.HemisphereLight(0x6080a0, 0x303040, 0.4); // Sky, Ground, Intensity
         this.scene.add(hemisphereLight);
    }

    setupPostProcessing() {
        // Example post-processing setup (requires importing passes)
        // const renderPass = new RenderPass(this.scene, this.camera);
        // this.composer.addPass(renderPass);

        // const bloomPass = new UnrealBloomPass(
        //     new THREE.Vector2(window.innerWidth, window.innerHeight),
        //     0.6, // strength
        //     0.4, // radius
        //     0.85 // threshold
        // );
        // this.composer.addPass(bloomPass);

        // Add other passes like SSAO, FXAA, etc. here
    }

    // --- Public Methods ---
    render() {
        // If using post-processing composer:
        // this.composer.render();
        // Otherwise, render directly:
        this.instance.render(this.scene, this.camera);
    }

    resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.instance.setSize(width, height);
        this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        // If using composer, update its size too
        // this.composer?.setSize(width, height);

        console.log("Renderer Resized");
    }

    // --- Scene Management ---
    add(object) {
        this.scene.add(object);
    }

    remove(object) {
        this.scene.remove(object);
    }

    // --- Utility ---
    isWebGLAvailable() {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {
            return false;
        }
    }

    getWebGLErrorMessage() {
        const message = 'Your browser or graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br/>Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.';
        const element = document.createElement('div');
        element.id = 'webgl-error-message';
        element.style.fontFamily = 'monospace';
        element.style.fontSize = '13px';
        element.style.fontWeight = 'normal';
        element.style.textAlign = 'center';
        element.style.background = '#fff';
        element.style.color = '#000';
        element.style.padding = '1.5em';
        element.style.width = '400px';
        element.style.margin = '5em auto 0';
        element.innerHTML = message;
        return element;
    }
}
