import { GeneralContext } from './dist/general_context.js';
import { InputManager } from './modules/ui/input-manager.js';
import { ChatManager } from './modules/chat/chat-manager.js';
import { ProviderManager } from './modules/chat/provider-manager.js';
import { MessageRenderer } from './modules/chat/message-renderer.js';
import { UIController } from './modules/ui/ui-controller.js';
import {
    getApiKeyForProvider,
    setApiKeyForProvider,
    loadApiKeysFromFile,
    maskApiKey
} from './dist/api-keys.js';

export class HyniChat {
    constructor() {
        // Initialize managers
        this.chatManager = new ChatManager();
        this.providerManager = new ProviderManager(this.chatManager);

        // Initialize UI components
        const messagesContainer = document.getElementById('chat-messages');
        this.messageRenderer = new MessageRenderer(messagesContainer);
        window.messageRenderer = this.messageRenderer;

        // State
        this.currentProvider = null;
        this.isProcessing = false;

        // Wait for input manager to be ready
        window.addEventListener('inputManagerReady', () => {
            this.uiController = new UIController();
            this.initializeUI();
            this.loadProviderKeys();
        }, { once: true });

        // Initialize input manager (it will trigger the event when ready)
        this.inputManager = new InputManager();
        this.inputManager.setOnInputCallback((text) => {
            console.log('Input received:', text);
            this.handleInput(text);
        });
        window.inputManager = this.inputManager;
    }

    initializeUI() {
        // Set up UI callbacks
        this.uiController.onProviderChange((provider) => this.onProviderChange(provider));
        this.uiController.onModelChange((model) => this.onModelChange(model));
        this.uiController.onBroadcastModeChange((enabled) => this.onBroadcastModeChange(enabled));
        this.uiController.onStreamingChange((enabled) => this.onStreamingChange(enabled));
        this.uiController.onMarkdownChange((enabled) => this.onMarkdownChange(enabled));
        this.uiController.onMultiTurnChange((enabled) => this.onMultiTurnChange(enabled));
        this.uiController.onClearChat(() => this.clearChat());

        // File upload for API keys - add null check
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.loadKeysFromFile(e));
        } else {
            console.warn('File input element not found');
        }

        // Add send button handler for text input
        const sendButton = document.getElementById('send-button');
        if (sendButton) {
            sendButton.addEventListener('click', () => {
                const textInput = document.getElementById('text-input');
                if (textInput) {
                    const message = textInput.value.trim();
                    if (message) {
                        this.handleInput(message);
                        textInput.value = ''; // Clear input after sending
                    }
                }
            });
        }

        // Initialize API keys UI
        this.updateApiKeysUI();
    }

    async handleInput(text) {
        if (!text || text.trim() === '') return;

        const state = this.uiController.getState();

        if (state.broadcastMode) {
            await this.broadcastMessage(text);
        } else {
            await this.sendSingleMessage(text);
        }
    }

    async sendSingleMessage(message) {
        if (this.isProcessing || !this.currentProvider) return;

        this.isProcessing = true;
        this.uiController.setProcessing(true);

        // Add user message
        this.messageRenderer.addUserMessage(message);
        this.chatManager.addMessage('user', message, this.currentProvider);

        try {
            const state = this.uiController.getState();
            const systemMessage = this.uiController.getSystemMessage();

            // Get the context
            const context = this.chatManager.getContext(this.currentProvider);

            // Clear messages if multi-turn is disabled
            if (!state.multiTurnEnabled && context) {
                context.clearUserMessages();
            }

            if (state.streamingEnabled) {
                const streamingMessage = this.messageRenderer.createStreamingMessage(this.currentProvider);

                await this.providerManager.sendToProvider(this.currentProvider, message, {
                    streaming: true,
                    systemMessage: systemMessage,
                    onProgress: (chunk, fullText) => {
                        streamingMessage.updateContent(fullText);
                    },
                    onComplete: (fullText) => {
                        streamingMessage.finalize();

                        // Only add to context/history if multi-turn is enabled
                        if (state.multiTurnEnabled) {
                            this.chatManager.addMessage('assistant', fullText, this.currentProvider);
                        }

                        this.updateStats();
                    },
                    onError: (error) => {
                        this.messageRenderer.addSystemMessage(`Error: ${error.message}`, 'error');
                    }
                });
            } else {
                await this.providerManager.sendToProvider(this.currentProvider, message, {
                    streaming: false,
                    systemMessage: systemMessage,
                    onComplete: (text, usage) => {
                        // Add assistant message to UI
                        this.messageRenderer.addAssistantMessage(text, this.currentProvider);

                        // Only add to context/history if multi-turn is enabled
                        if (state.multiTurnEnabled) {
                            this.chatManager.addMessage('assistant', text, this.currentProvider);
                        }

                        if (usage?.total_tokens) {
                            this.chatManager.updateTokenCount(usage.total_tokens);
                        }
                        this.updateStats();
                    },
                    onError: (error) => {
                        this.messageRenderer.addSystemMessage(`Error: ${error.message}`, 'error');
                    }
                });
            }

        } catch (error) {
            console.error('Error sending message:', error);
            this.messageRenderer.addSystemMessage(`Error: ${error.message}`, 'error');
        } finally {
            this.isProcessing = false;
            this.uiController.setProcessing(false);
        }
    }

    async broadcastMessage(message) {
        if (this.isProcessing) return;

        const configuredProviders = this.chatManager.getConfiguredProviders();
        if (configuredProviders.length === 0) {
            this.messageRenderer.addSystemMessage('No providers configured. Please set API keys first.', 'error');
            return;
        }

        this.isProcessing = true;
        this.uiController.setProcessing(true);

        // Add user message
        this.messageRenderer.addUserMessage(message);
        this.chatManager.addMessage('user', message, 'broadcast');

        // Show broadcast notification
        this.messageRenderer.addBroadcastMessage(
            `Broadcasting to ${configuredProviders.length} providers: ${configuredProviders.join(', ')}`
        );

        const state = this.uiController.getState();
        const systemMessage = this.uiController.getSystemMessage();

        // Clear messages if multi-turn is disabled
        if (!state.multiTurnEnabled) {
            configuredProviders.forEach(provider => {
                const context = this.chatManager.getContext(provider);
                if (context) {
                    context.clearUserMessages();
                }
            });
        }

        // Send to all providers
        const promises = configuredProviders.map(provider => {
            if (state.streamingEnabled) {
                const streamingMessage = this.messageRenderer.createStreamingMessage(provider);

                return this.providerManager.sendToProvider(provider, message, {
                    streaming: true,
                    systemMessage: systemMessage,
                    onProgress: (chunk, fullText) => {
                        streamingMessage.updateContent(fullText);
                    },
                    onComplete: (fullText) => {
                        streamingMessage.finalize();

                        // Only add to context/history if multi-turn is enabled
                        if (state.multiTurnEnabled) {
                            this.chatManager.addMessage('assistant', fullText, provider);
                        }
                    },
                    onError: (error) => {
                        this.messageRenderer.addSystemMessage(
                            `${provider} error: ${error.message}`,
                            'error'
                        );
                    }
                });
            } else {
                return this.providerManager.sendToProvider(provider, message, {
                    streaming: false,
                    systemMessage: systemMessage,
                    onComplete: (text, usage) => {
                        // Add assistant message to UI
                        this.messageRenderer.addAssistantMessage(text, provider);

                        // Only add to context/history if multi-turn is enabled
                        if (state.multiTurnEnabled) {
                            this.chatManager.addMessage('assistant', text, provider);
                        }

                        if (usage?.total_tokens) {
                            this.chatManager.updateTokenCount(usage.total_tokens);
                        }
                    },
                    onError: (error) => {
                        this.messageRenderer.addSystemMessage(
                            `${provider} error: ${error.message}`,
                            'error'
                        );
                    }
                });
            }
        });

        await Promise.allSettled(promises);

        this.updateStats();
        this.isProcessing = false;
        this.uiController.setProcessing(false);
    }

    async onProviderChange(provider) {
        if (!provider) {
            this.currentProvider = null;
            this.uiController.updateProviderInfo(null, null);
            this.uiController.enableInputs(false);

            // Also update the text input and send button
            const textInput = document.getElementById('text-input');
            const sendButton = document.getElementById('send-button');
            if (textInput) textInput.disabled = true;
            if (sendButton) sendButton.disabled = true;

            return;
        }

        try {
            this.currentProvider = provider;
            const context = await this.chatManager.loadProvider(provider);

            // Update UI
            const models = context.getSupportedModels();
            const defaultModel = context.getSchema().models?.default;

            this.uiController.updateProviderInfo(provider, defaultModel);
            this.uiController.updateModelSelection(models, defaultModel);

            if (defaultModel) {
                context.setModel(defaultModel);
            }

            // Enable/disable based on API key
            const hasKey = context.hasApiKey();
            this.uiController.enableInputs(hasKey);

            // Also update the text input and send button
            const textInput = document.getElementById('text-input');
            const sendButton = document.getElementById('send-button');
            if (textInput) textInput.disabled = !hasKey;
            if (sendButton) sendButton.disabled = !hasKey;

            if (!hasKey) {
                this.messageRenderer.addSystemMessage(
                    `Please enter your API key for ${provider} to start chatting.`
                );
            }

        } catch (error) {
            console.error('Error loading provider:', error);
            this.messageRenderer.addSystemMessage(`Failed to load provider: ${error.message}`, 'error');
        }
    }

    onModelChange(model) {
        if (this.currentProvider && model) {
            const context = this.chatManager.getContext(this.currentProvider);
            if (context) {
                context.setModel(model);
                this.uiController.updateProviderInfo(this.currentProvider, model);
            }
        }
    }

    onBroadcastModeChange(enabled) {
        if (enabled) {
            const hasAnyKey = this.chatManager.getConfiguredProviders().length > 0;
            this.uiController.enableInputs(hasAnyKey);

            if (!hasAnyKey) {
                this.messageRenderer.addSystemMessage(
                    'Please configure at least one API key to use broadcast mode.'
                );
            }
        } else if (this.currentProvider) {
            const context = this.chatManager.getContext(this.currentProvider);
            const hasKey = context?.hasApiKey() || false;
            this.uiController.enableInputs(hasKey);
        }
    }

    onStreamingChange(enabled) {
        // Could add any streaming-specific logic here
        console.log('Streaming:', enabled);
    }

    onMarkdownChange(enabled) {
        this.messageRenderer.setMarkdownEnabled(enabled);
    }

    onMultiTurnChange(enabled) {
        console.log('Multi-turn conversation:', enabled);

        // If multi-turn is disabled, clear conversation history
        if (!enabled) {
            // Clear messages for all contexts
            this.chatManager.clearAllContextMessages();
        }
    }

    updateApiKeysUI() {
        const container = document.getElementById('api-keys-container');
        const providers = ['openai', 'claude', 'deepseek', 'mistral'];

        container.innerHTML = providers.map(provider => {
            const apiKey = getApiKeyForProvider(provider);
            const hasKey = !!apiKey;

            return `
                <div class="api-key-item">
                    <div class="api-key-header">
                        <span class="provider-name">${provider.toUpperCase()}</span>
                        <span class="key-status ${hasKey ? 'configured' : 'not-configured'}">
                            ${hasKey ? `✓ ${maskApiKey(apiKey)}` : 'Not Set'}
                        </span>
                    </div>
                    <input
                        type="password"
                        class="api-key-input"
                        id="key-input-${provider}"
                        placeholder="Enter API key..."
                    >
                    <div class="api-key-buttons">
                        <button class="btn-small btn-primary" onclick="window.hyniChat.setApiKey('${provider}')">
                            Set Key
                        </button>
                        ${hasKey ? `<button class="btn-small btn-danger" onclick="window.hyniChat.removeApiKey('${provider}')">Remove</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    setApiKey(provider) {
        const input = document.getElementById(`key-input-${provider}`);
        const apiKey = input.value.trim();

        if (!apiKey) {
            alert('Please enter an API key');
            return;
        }

        setApiKeyForProvider(provider, apiKey, true);
        input.value = '';

        // Update context if loaded
        const context = this.chatManager.getContext(provider);
        if (context) {
            context.setApiKey(apiKey);
        }

        // Update UI
        if (this.currentProvider === provider) {
            this.uiController.enableInputs(true);
        }

        const state = this.uiController.getState();
        if (state.broadcastMode) {
            this.onBroadcastModeChange(true);
        }

        this.updateApiKeysUI();
        this.messageRenderer.addSystemMessage(`API key set for ${provider}`);
    }

    removeApiKey(provider) {
        localStorage.removeItem(`hyni_${this.getEnvVar(provider)}`);
        sessionStorage.removeItem(`hyni_${this.getEnvVar(provider)}`);

        if (this.currentProvider === provider) {
            this.uiController.enableInputs(false);
        }

        const state = this.uiController.getState();
        if (state.broadcastMode) {
            this.onBroadcastModeChange(true);
        }

        this.updateApiKeysUI();
        this.messageRenderer.addSystemMessage(`API key removed for ${provider}`);
    }

    getEnvVar(provider) {
        const mapping = {
            'openai': 'OA_API_KEY',
            'claude': 'CL_API_KEY',
            'deepseek': 'DS_API_KEY',
            'mistral': 'MS_API_KEY'
        };
        return mapping[provider];
    }

    async loadKeysFromFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            await loadApiKeysFromFile(file);
            this.updateApiKeysUI();
            this.messageRenderer.addSystemMessage('API keys loaded from file');

            // Reload contexts with new keys
            for (const [provider, context] of this.chatManager.contexts) {
                const apiKey = getApiKeyForProvider(provider);
                if (apiKey) {
                    context.setApiKey(apiKey);
                }
            }

            // Update current provider state
            if (this.currentProvider) {
                const context = this.chatManager.getContext(this.currentProvider);
                if (context?.hasApiKey()) {
                    this.uiController.enableInputs(true);
                }
            }

        } catch (error) {
            this.messageRenderer.addSystemMessage(`Failed to load keys: ${error.message}`, 'error');
        }
    }

    loadProviderKeys() {
        const params = new URLSearchParams(window.location.search);
        const providers = ['openai', 'claude', 'deepseek', 'mistral'];

        providers.forEach(provider => {
            const key = params.get(`${provider}_key`) || params.get(this.getEnvVar(provider));
            if (key) {
                setApiKeyForProvider(provider, key, false);
            }
        });

        this.updateApiKeysUI();
    }

    clearChat() {
        if (confirm('Clear all messages?')) {
            this.messageRenderer.clearAllMessages();
            this.chatManager.clearHistory();
            this.updateStats();
        }
    }

    updateStats() {
        const stats = this.chatManager.getStats();
        this.uiController.updateStats(stats.messageCount, stats.tokenCount);
    }

    cleanup() {
        if (this.inputManager) {
            this.inputManager.cleanup();
        }
    }
}
