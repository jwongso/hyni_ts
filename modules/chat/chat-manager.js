import { GeneralContext } from '../../dist/general_context.js';
import {
    getApiKeyForProvider,
    setApiKeyForProvider,
} from '../../dist/api-keys.js';

export class ChatManager {
    constructor() {
        this.contexts = new Map();
        this.messageHistory = [];
        this.tokenCount = 0;
        this.messageCount = 0;
    }

    async loadProvider(provider) {
        if (this.contexts.has(provider)) {
            return this.contexts.get(provider);
        }

        try {
            const response = await fetch(`schemas/${provider}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load schema: ${response.statusText}`);
            }

            const schema = await response.json();
            const context = new GeneralContext(schema);

            // Set API key if available
            const apiKey = getApiKeyForProvider(provider);
            if (apiKey) {
                context.setApiKey(apiKey);
            }

            this.contexts.set(provider, context);
            return context;
        } catch (error) {
            console.error(`Error loading provider ${provider}:`, error);
            throw error;
        }
    }

    getContext(provider) {
        return this.contexts.get(provider);
    }

    getAllContexts() {
        return Array.from(this.contexts.values());
    }

    getConfiguredProviders() {
        const providers = ['openai', 'claude', 'deepseek', 'mistral'];
        return providers.filter(provider => {
            const apiKey = getApiKeyForProvider(provider);
            return !!apiKey;
        });
    }

    addMessage(role, content, provider = null) {
        const message = {
            id: Date.now() + Math.random(),
            role,
            content,
            provider,
            timestamp: new Date(),
            tokens: 0
        };

        this.messageHistory.push(message);
        this.messageCount++;

        return message;
    }

    updateTokenCount(tokens) {
        this.tokenCount += tokens;
    }

    getStats() {
        return {
            messageCount: this.messageCount,
            tokenCount: this.tokenCount,
            totalProviders: this.contexts.size,
            configuredProviders: this.getConfiguredProviders().length
        };
    }

    clearHistory() {
        this.messageHistory = [];
        this.messageCount = 0;
        this.tokenCount = 0;

        // Clear contexts
        this.contexts.forEach(context => {
            if (context.clearUserMessages) {
                context.clearUserMessages();
            }
        });
    }

    clearAllContextMessages() {
        this.contexts.forEach((context) => {
            if (context.clearUserMessages) {
                context.clearUserMessages();
            }
        });
    }

    exportHistory() {
        return {
            messages: this.messageHistory,
            stats: this.getStats(),
            exportedAt: new Date().toISOString()
        };
    }
}
