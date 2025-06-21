/**
 * API Key management for browser environment
 * Since browsers don't have access to environment variables or filesystem,
 * we use localStorage and provide methods to load from various sources
 */

// Provider to environment variable mapping
const PROVIDER_ENV_MAP: Record<string, string> = {
    'openai': 'OA_API_KEY',
    'deepseek': 'DS_API_KEY',
    'claude': 'CL_API_KEY',
    'mistral': 'MS_API_KEY'
};

/**
 * Get API key for a provider from various sources
 * Tries in order:
 * 1. Session storage (temporary)
 * 2. Local storage (persistent)
 * 3. Cached keys in memory
 * 4. Prompt user if interactive mode enabled
 */
export function getApiKeyForProvider(provider: string): string {
    const envVar = PROVIDER_ENV_MAP[provider];
    if (!envVar) {
        console.warn(`Unknown provider: ${provider}`);
        return '';
    }

    // Try session storage first (temporary keys)
    const sessionKey = sessionStorage.getItem(`hyni_${envVar}`);
    if (sessionKey) {
        return sessionKey;
    }

    // Try local storage (persistent keys)
    const localKey = localStorage.getItem(`hyni_${envVar}`);
    if (localKey) {
        return localKey;
    }

    // Try memory cache
    const cachedKey = API_KEY_CACHE.get(envVar);
    if (cachedKey) {
        return cachedKey;
    }

    return '';
}

/**
 * Set API key for a provider
 * @param provider Provider name
 * @param apiKey API key value
 * @param persistent Whether to persist in localStorage
 */
export function setApiKeyForProvider(
    provider: string,
    apiKey: string,
    persistent: boolean = false
): void {
    const envVar = PROVIDER_ENV_MAP[provider];
    if (!envVar) {
        throw new Error(`Unknown provider: ${provider}`);
    }

    // Always store in memory cache
    API_KEY_CACHE.set(envVar, apiKey);

    if (persistent) {
        // Store in localStorage for persistence across sessions
        localStorage.setItem(`hyni_${envVar}`, apiKey);
    } else {
        // Store in sessionStorage for current session only
        sessionStorage.setItem(`hyni_${envVar}`, apiKey);
    }
}

/**
 * Remove API key for a provider
 */
export function removeApiKeyForProvider(provider: string): void {
    const envVar = PROVIDER_ENV_MAP[provider];
    if (!envVar) {
        return;
    }

    API_KEY_CACHE.delete(envVar);
    sessionStorage.removeItem(`hyni_${envVar}`);
    localStorage.removeItem(`hyni_${envVar}`);
}

/**
 * Load API keys from a .hynirc-style configuration object
 * This can be used after fetching a config file or receiving config from user
 */
export function loadApiKeysFromConfig(config: Record<string, string>): void {
    for (const [key, value] of Object.entries(config)) {
        if (key.endsWith('_API_KEY') || Object.values(PROVIDER_ENV_MAP).includes(key)) {
            API_KEY_CACHE.set(key, value);
        }
    }
}

/**
 * Parse .hynirc format content
 * Supports both 'export KEY=value' and 'KEY=value' formats
 */
export function parseHynirc(content: string): Record<string, string> {
    const config: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        // Handle 'export KEY=value' format
        let keyValue = trimmed;
        if (trimmed.startsWith('export ')) {
            keyValue = trimmed.substring(7).trim();
        }

        // Parse KEY=value
        const equalIndex = keyValue.indexOf('=');
        if (equalIndex > 0) {
            const key = keyValue.substring(0, equalIndex).trim();
            let value = keyValue.substring(equalIndex + 1).trim();

            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            config[key] = value;
        }
    }

    return config;
}

/**
 * Load API keys from a URL (e.g., .hynirc file served statically)
 * Note: Be careful with security - only load from trusted sources
 */
export async function loadApiKeysFromURL(url: string): Promise<void> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load config from ${url}: ${response.statusText}`);
        }

        const content = await response.text();
        const config = parseHynirc(content);
        loadApiKeysFromConfig(config);
    } catch (error) {
        console.error('Failed to load API keys from URL:', error);
        throw error;
    }
}

/**
 * Browser-specific: Load API keys from a File object
 * Useful for file input elements
 */
export async function loadApiKeysFromFile(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                const config = parseHynirc(content);
                loadApiKeysFromConfig(config);
                resolve();
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };

        reader.readAsText(file);
    });
}

/**
 * Get all configured API keys (masked for display)
 */
export function getConfiguredProviders(): Array<{
    provider: string;
    envVar: string;
    hasKey: boolean;
    maskedKey?: string;
}> {
    const providers = [];

    for (const [provider, envVar] of Object.entries(PROVIDER_ENV_MAP)) {
        const key = getApiKeyForProvider(provider);
        providers.push({
            provider,
            envVar,
            hasKey: !!key,
            maskedKey: key ? maskApiKey(key) : undefined
        });
    }

    return providers;
}

/**
 * Mask API key for display
 */
export function maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 8) {
        return '***';
    }
    return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

/**
 * Clear all stored API keys
 */
export function clearAllApiKeys(): void {
    API_KEY_CACHE.clear();

    // Clear from storage
    for (const envVar of Object.values(PROVIDER_ENV_MAP)) {
        sessionStorage.removeItem(`hyni_${envVar}`);
        localStorage.removeItem(`hyni_${envVar}`);
    }
}

/**
 * Export API keys configuration (masked)
 * Useful for debugging
 */
export function exportApiKeyStatus(): Record<string, any> {
    const status: Record<string, any> = {
        providers: {},
        storage: {
            session: [],
            local: [],
            memory: []
        }
    };

    for (const [provider, envVar] of Object.entries(PROVIDER_ENV_MAP)) {
        const key = getApiKeyForProvider(provider);
        status.providers[provider] = {
            envVar,
            configured: !!key,
            maskedKey: key ? maskApiKey(key) : null,
            inSession: !!sessionStorage.getItem(`hyni_${envVar}`),
            inLocal: !!localStorage.getItem(`hyni_${envVar}`),
            inMemory: API_KEY_CACHE.has(envVar)
        };
    }

    return status;
}

// In-memory cache for API keys
const API_KEY_CACHE = new Map<string, string>();

/**
 * Secure API key storage with encryption
 * Uses Web Crypto API for encryption
 */
export class SecureApiKeyStorage {
    private static SALT = 'hyni-secure-storage-v1';
    private static ITERATIONS = 100000;

    /**
     * Encrypt and store API key
     */
    static async setSecure(
        provider: string,
        apiKey: string,
        password: string
    ): Promise<void> {
        const envVar = PROVIDER_ENV_MAP[provider];
        if (!envVar) {
            throw new Error(`Unknown provider: ${provider}`);
        }

        const encrypted = await this.encrypt(apiKey, password);
        localStorage.setItem(`hyni_secure_${envVar}`, encrypted);
    }

    /**
     * Retrieve and decrypt API key
     */
    static async getSecure(
        provider: string,
        password: string
    ): Promise<string | null> {
        const envVar = PROVIDER_ENV_MAP[provider];
        if (!envVar) {
            return null;
        }

        const encrypted = localStorage.getItem(`hyni_secure_${envVar}`);
        if (!encrypted) {
            return null;
        }

        try {
            return await this.decrypt(encrypted, password);
        } catch (error) {
            console.error('Failed to decrypt API key:', error);
            return null;
        }
    }

    private static async encrypt(text: string, password: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);

        const key = await this.deriveKey(password);
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        // Combine iv and encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        // Convert to base64
        return btoa(String.fromCharCode(...combined));
    }

    private static async decrypt(encryptedBase64: string, password: string): Promise<string> {
        // Convert from base64
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

        // Extract iv and data
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);

        const key = await this.deriveKey(password);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    private static async deriveKey(password: string): Promise<CryptoKey> {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(this.SALT),
                iterations: this.ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }
}

// Initialize API keys from URL parameters (useful for demos)
export function initApiKeysFromURLParams(): void {
    const params = new URLSearchParams(window.location.search);

    for (const [provider, envVar] of Object.entries(PROVIDER_ENV_MAP)) {
        const key = params.get(envVar) || params.get(provider);
        if (key) {
            setApiKeyForProvider(provider, key, false);
            console.log(`Loaded API key for ${provider} from URL parameters`);
        }
    }
}

// Auto-initialize from URL params if present
if (typeof window !== 'undefined' && window.location) {
    initApiKeysFromURLParams();
}
