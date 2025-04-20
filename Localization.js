/**
 * LocalizationService.js - Advanced localization module
 *
 * Loads language data asynchronously, supports interpolation, pluralization,
 * namespacing, and provides robust fallback mechanisms.
 */
class LocalizationService {
    /**
     * @typedef {Object.<string, any>} LanguageStrings
     */

    /**
     * @typedef {Object} LocalizationOptions
     * @property {string} [initialLang] - Explicit initial language code.
     * @property {string} [defaultLang='en'] - Default language if detection fails or requested lang is unavailable.
     * @property {string} [fallbackLang='en'] - Language to try if a key is missing in the current language.
     * @property {string[]} supportedLanguages - Array of supported language codes (e.g., ['en', 'ko']).
     * @property {string} [resourcePath='/locales/{lang}.json'] - Path template to language JSON files. {lang} is replaced with the language code.
     * @property {string} [storageKey='gameLanguage'] - Key used for storing the selected language in localStorage.
     * @property {boolean} [debug=false] - Enable debug logging for missing keys.
     * @property {(key: string, lang: string) => string} [missingKeyHandler] - Custom function to handle missing keys. Defaults to returning the key and logging a warning in debug mode.
     */

    /** @type {string} */
    currentLanguage;
    /** @type {string} */
    #defaultLang;
    /** @type {string} */
    #fallbackLang;
    /** @type {string[]} */
    #supportedLanguages;
    /** @type {string} */
    #resourcePath;
    /** @type {string} */
    #storageKey;
    /** @type {boolean} */
    #debug;
    /** @type {(key: string, lang: string) => string} */
    #missingKeyHandler;
    /** @type {Map<string, LanguageStrings>} */
    #stringCache = new Map();
    /** @type {boolean} */
    #isInitialized = false;

    /**
     * Creates an instance of LocalizationService.
     * @param {LocalizationOptions} options - Configuration options.
     */
    constructor(options) {
        if (!options || !options.supportedLanguages || options.supportedLanguages.length === 0) {
            throw new Error("LocalizationService requires 'supportedLanguages' option with at least one language.");
        }

        this.#defaultLang = options.defaultLang || 'en';
        this.#fallbackLang = options.fallbackLang || this.#defaultLang;
        this.#supportedLanguages = options.supportedLanguages;
        this.#resourcePath = options.resourcePath || '/locales/{lang}.json';
        this.#storageKey = options.storageKey || 'gameLanguage';
        this.#debug = options.debug || false;
        this.#missingKeyHandler = options.missingKeyHandler || this.#defaultMissingKeyHandler;

        if (!this.#supportedLanguages.includes(this.#defaultLang)) {
            console.warn(`Default language "${this.#defaultLang}" is not in the supported languages list. Using "${this.#supportedLanguages[0]}" as default.`);
            this.#defaultLang = this.#supportedLanguages[0];
        }
        if (!this.#supportedLanguages.includes(this.#fallbackLang)) {
             console.warn(`Fallback language "${this.#fallbackLang}" is not in the supported languages list. Using "${this.#defaultLang}" as fallback.`);
            this.#fallbackLang = this.#defaultLang;
        }

        this.currentLanguage = options.initialLang || this.#detectLanguage();
    }

    /**
     * Initializes the service by loading the current language data.
     * Must be called before using getText or other language-dependent methods.
     * @returns {Promise<void>}
     */
    async init() {
        if (this.#isInitialized) {
            console.warn("LocalizationService already initialized.");
            return;
        }
        try {
            await this.#loadLanguageData(this.currentLanguage);
            this.#isInitialized = true;
            console.log(`LocalizationService initialized. Language set to: ${this.currentLanguage}`);
            // Apply initial translations if the DOM is ready
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
               this.updateAllTexts();
            } else {
                document.addEventListener('DOMContentLoaded', () => this.updateAllTexts());
            }
        } catch (error) {
            console.error(`Failed to initialize LocalizationService with language "${this.currentLanguage}". Falling back to default "${this.#defaultLang}".`, error);
            if (this.currentLanguage !== this.#defaultLang) {
                try {
                    this.currentLanguage = this.#defaultLang;
                    await this.#loadLanguageData(this.currentLanguage);
                    this.#saveLanguagePreference(this.currentLanguage);
                    this.#isInitialized = true;
                     console.log(`LocalizationService initialized with fallback language: ${this.currentLanguage}`);
                     if (document.readyState === 'complete' || document.readyState === 'interactive') {
                        this.updateAllTexts();
                     }
                } catch (fallbackError) {
                    console.error(`FATAL: Failed to load default language "${this.#defaultLang}". Localization will not work.`, fallbackError);
                    // Mark as initialized to prevent infinite loops, but service is unusable.
                    this.#isInitialized = true;
                }
            } else {
                 console.error(`FATAL: Failed to load default language "${this.#defaultLang}". Localization will not work.`, error);
                 this.#isInitialized = true; // Mark as initialized to prevent loops
            }
        }
    }

    /**
     * Detects the preferred language based on storage, browser settings, and supported languages.
     * @returns {string} The detected language code.
     */
    #detectLanguage() {
        // 1. Check localStorage
        const savedLang = localStorage.getItem(this.#storageKey);
        if (savedLang && this.#supportedLanguages.includes(savedLang)) {
            return savedLang;
        }

        // 2. Check browser preferences (navigator.languages)
        if (navigator.languages && navigator.languages.length) {
            for (const lang of navigator.languages) {
                const baseLang = lang.split('-')[0]; // 'en-US' -> 'en'
                if (this.#supportedLanguages.includes(lang)) {
                    return lang;
                }
                if (this.#supportedLanguages.includes(baseLang)) {
                    return baseLang;
                }
            }
        }

        // 3. Check navigator.language (less specific)
        const browserLang = navigator.language?.split('-')[0];
        if (browserLang && this.#supportedLanguages.includes(browserLang)) {
            return browserLang;
        }

        // 4. Fallback to default language
        return this.#defaultLang;
    }

    /**
     * Saves the selected language to localStorage.
     * @param {string} lang - Language code to save.
     */
    #saveLanguagePreference(lang) {
        try {
            localStorage.setItem(this.#storageKey, lang);
        } catch (e) {
            console.warn("Could not save language preference to localStorage.", e);
        }
    }

    /**
     * Fetches and caches language data for a given language code.
     * @param {string} lang - The language code (e.g., 'en', 'ko').
     * @returns {Promise<LanguageStrings>} The loaded language strings.
     * @throws {Error} If fetching or parsing fails.
     */
    async #loadLanguageData(lang) {
        if (!this.#supportedLanguages.includes(lang)) {
            throw new Error(`Language "${lang}" is not supported.`);
        }
        if (this.#stringCache.has(lang)) {
            return this.#stringCache.get(lang);
        }

        const url = this.#resourcePath.replace('{lang}', lang);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} for ${url}`);
            }
            const data = await response.json();
            this.#stringCache.set(lang, data);
            return data;
        } catch (error) {
            console.error(`Failed to load language file: ${url}`, error);
            throw error; // Re-throw to be handled by the caller (init or setLanguage)
        }
    }

    /**
     * Retrieves a translated string for the given key.
     * Supports namespacing (e.g., 'ui.buttons.confirm'), interpolation, and basic pluralization.
     *
     * @param {string} key - The key of the string to retrieve (use '.' for nesting).
     * @param {Object.<string, any>} [options] - Options for interpolation and pluralization.
     * @param {number} [options.count] - Value for pluralization. Checks for `key_plural` if count !== 1.
     * @param {Object.<string, string|number>} [options.values] - Key-value pairs for interpolation (e.g., { name: 'Player' }).
     * @returns {string} The translated string, or the key/fallback if not found.
     */
    getText(key, options = {}) {
        if (!this.#isInitialized) {
            console.warn("LocalizationService not initialized. Call init() first.");
            return key; // Return key if not ready
        }

        const { count, values } = options;
        let targetKey = key;

        // Basic Pluralization: If count is provided and not 1, try appending '_plural'.
        // More advanced libraries use CLDR rules, this is a simple common case.
        if (count !== undefined && count !== 1) {
            const pluralKey = `${key}_plural`;
             // Check if plural key exists before using it
            if (this.#getString(pluralKey, this.currentLanguage) !== null ||
                this.#getString(pluralKey, this.#fallbackLang) !== null ||
                this.#getString(pluralKey, this.#defaultLang) !== null) {
                targetKey = pluralKey;
            }
        }

        // Get string using fallback chain: Current -> Fallback -> Default
        let translated = this.#getString(targetKey, this.currentLanguage);
        if (translated === null) {
            translated = this.#getString(targetKey, this.#fallbackLang);
            if (translated === null && this.#fallbackLang !== this.#defaultLang) {
                translated = this.#getString(targetKey, this.#defaultLang);
            }
        }

        // Handle missing key
        if (translated === null) {
            return this.#missingKeyHandler(key, this.currentLanguage); // Use original key for missing handler
        }

        // Interpolation: Replace placeholders like {name}
        if (values && typeof translated === 'string') {
            for (const placeholder in values) {
                // Use a regex for safer replacement (global, handles multiple occurrences)
                const regex = new RegExp(`\\{${placeholder}\\}`, 'g');
                translated = translated.replace(regex, values[placeholder]);
            }
        }

        // Interpolate count if provided and {count} exists
        if (count !== undefined && typeof translated === 'string' && values?.count === undefined) {
             translated = translated.replace(/\{count\}/g, String(count));
        }


        return translated;
    }

    /**
     * Internal helper to get a string from the cache, handling nested keys.
     * @param {string} key - The key (e.g., 'ui.submit').
     * @param {string} lang - The language code.
     * @returns {string | null} The string value or null if not found.
     */
    #getString(key, lang) {
        const strings = this.#stringCache.get(lang);
        if (!strings) {
            return null;
        }

        // Handle namespaced keys (e.g., "settings.audio.volume")
        const keyParts = key.split('.');
        let value = strings;
        for (const part of keyParts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return null; // Key path not found
            }
        }

        return typeof value === 'string' ? value : null; // Only return strings
    }

    /**
     * Default handler for missing keys.
     * @param {string} key - The missing key.
     * @param {string} lang - The language it was requested for.
     * @returns {string}
     */
    #defaultMissingKeyHandler(key, lang) {
        if (this.#debug) {
            console.warn(`Missing translation key: "${key}" for language "${lang}".`);
        }
        return key; // Return the key itself as fallback
    }

    /**
     * Changes the current language, loads the new data, and updates the UI.
     * @param {string} lang - The language code to switch to.
     * @returns {Promise<boolean>} True if the language was changed successfully, false otherwise.
     */
    async setLanguage(lang) {
        if (!this.#supportedLanguages.includes(lang)) {
            console.error(`Attempted to set unsupported language: ${lang}`);
            return false;
        }
        if (lang === this.currentLanguage && this.#stringCache.has(lang)) {
            return true; // Already set and loaded
        }

        const oldLanguage = this.currentLanguage;
        try {
            await this.#loadLanguageData(lang); // Preload before changing state
            this.currentLanguage = lang;
            this.#saveLanguagePreference(lang);
            this.#dispatchUpdateEvent(oldLanguage, lang);
            this.updateAllTexts(); // Update UI elements
            console.log(`Language changed to: ${this.currentLanguage}`);
            return true;
        } catch (error) {
            console.error(`Failed to switch language to "${lang}". Reverting to "${oldLanguage}".`, error);
            // Optionally revert state if needed, though currentLanguage wasn't updated yet.
            return false;
        }
    }

    /**
     * Updates all elements with `data-i18n` and other related attributes.
     */
    updateAllTexts() {
         if (!this.#isInitialized) {
            console.warn("Cannot update texts, LocalizationService not initialized.");
            return;
        }
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            // Check for interpolation/pluralization options defined as data attributes
            const options = this.#getOptionsFromElement(element);
            element.textContent = this.getText(key, options);
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const options = this.#getOptionsFromElement(element);
            element.placeholder = this.getText(key, options);
        });

         document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const options = this.#getOptionsFromElement(element);
            element.title = this.getText(key, options);
        });

        // Add more attributes as needed (e.g., data-i18n-value)
    }

    /**
     * Extracts options for getText from element data attributes.
     * Supports data-i18n-values (JSON) and data-i18n-count.
     * @param {HTMLElement} element
     * @returns {Object.<string, any>}
     */
     #getOptionsFromElement(element) {
        const options = {};
        const countAttr = element.dataset.i18nCcount; // data-i18n-count="5"
        const valuesAttr = element.dataset.i18nValues; // data-i18n-values='{"name":"User"}'

        if (countAttr !== undefined) {
            const count = parseInt(countAttr, 10);
            if (!isNaN(count)) {
                options.count = count;
            }
        }
        if (valuesAttr) {
            try {
                options.values = JSON.parse(valuesAttr);
            } catch (e) {
                console.warn("Failed to parse data-i18n-values JSON:", valuesAttr, e);
            }
        }
        return options;
    }


    /**
     * Applies translation to a specific element dynamically.
     * @param {HTMLElement} element - The target element.
     * @param {string} key - The translation key.
     * @param {Object.<string, any>} [options] - Interpolation/pluralization options.
     * @param {'textContent' | 'innerHTML' | 'placeholder' | 'title'} [attribute='textContent'] - Which property/attribute to set.
     */
    applyToElement(element, key, options = {}, attribute = 'textContent') {
        if (element) {
            const text = this.getText(key, options);
            if (attribute === 'textContent' || attribute === 'innerHTML' || attribute === 'placeholder' || attribute === 'title') {
                 element[attribute] = text;
            } else {
                 // For other attributes like 'aria-label' etc.
                element.setAttribute(attribute, text);
            }
        }
    }

    /**
     * Dispatches a custom event when the language changes.
     * @param {string} oldLanguage
     * @param {string} newLanguage
     */
    #dispatchUpdateEvent(oldLanguage, newLanguage) {
        const event = new CustomEvent('localizationUpdated', {
            detail: {
                oldLanguage: oldLanguage,
                newLanguage: newLanguage,
                service: this // Pass reference to the service instance
            }
        });
        document.dispatchEvent(event);
    }

    /**
     * Formats a number according to the current locale's conventions.
     * @param {number} number - The number to format.
     * @param {Intl.NumberFormatOptions} [options] - Options for Intl.NumberFormat.
     * @returns {string} The formatted number.
     */
    formatNumber(number, options) {
        try {
            return new Intl.NumberFormat(this.currentLanguage, options).format(number);
        } catch (e) {
            console.warn(`Error formatting number for language ${this.currentLanguage}:`, e);
            return String(number); // Fallback to simple string conversion
        }
    }

    /**
     * Formats a date according to the current locale's conventions.
     * @param {Date | number} date - The date object or timestamp to format.
     * @param {Intl.DateTimeFormatOptions} [options] - Options for Intl.DateTimeFormat.
     * @returns {string} The formatted date string.
     */
    formatDate(date, options) {
        try {
            return new Intl.DateTimeFormat(this.currentLanguage, options).format(date);
        } catch (e) {
            console.warn(`Error formatting date for language ${this.currentLanguage}:`, e);
            return String(date); // Fallback
        }
    }

    /**
     * Returns the currently active language code.
     * @returns {string}
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * Returns the list of supported language codes.
     * @returns {string[]}
     */
    getSupportedLanguages() {
        // Return a copy to prevent external modification
        return [...this.#supportedLanguages];
    }
}
