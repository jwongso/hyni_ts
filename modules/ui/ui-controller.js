export class UIController {
    constructor() {
        this.elements = {};
        this.callbacks = {};
        this.state = {
            isProcessing: false,
            broadcastMode: false,
            streamingEnabled: false,
            markdownEnabled: true
        };

        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        // Cache DOM elements
        this.elements = {
            providerSelect: document.getElementById('provider-select'),
            modelSelect: document.getElementById('model-select'),
            sendButton: document.getElementById('send-button'),
            sendText: document.getElementById('send-text'),
            sendSpinner: document.getElementById('send-spinner'),
            broadcastCheck: document.getElementById('broadcast-check'),
            streamingCheck: document.getElementById('streaming-check'),
            markdownCheck: document.getElementById('markdown-check'),
            multiTurnCheck: document.getElementById('multi-turn-check'),
            broadcastIndicator: document.getElementById('broadcast-indicator'),
            currentProvider: document.getElementById('current-provider'),
            currentModel: document.getElementById('current-model'),
            clearChat: document.getElementById('clear-chat'),
            systemMessage: document.getElementById('system-message'),
            messageCount: document.getElementById('message-count'),
            tokenCount: document.getElementById('token-count')
        };
        // Log missing elements for debugging
        Object.entries(this.elements).forEach(([key, element]) => {
            if (!element) {
                console.warn(`UIController: Element '${key}' not found`);
            }
        });
    }

    setupEventListeners() {
        // Provider selection
        if (this.elements.providerSelect) {
            this.elements.providerSelect.addEventListener('change', (e) => {
                this.triggerCallback('providerChange', e.target.value);
            });
        }

        // Model selection
        if (this.elements.modelSelect) {
            this.elements.modelSelect.addEventListener('change', (e) => {
                this.triggerCallback('modelChange', e.target.value);
            });
        }

        // Broadcast mode
        if (this.elements.broadcastCheck) {
            this.elements.broadcastCheck.addEventListener('change', (e) => {
                this.state.broadcastMode = e.target.checked;
                this.updateBroadcastUI();
                this.triggerCallback('broadcastModeChange', e.target.checked);
            });
        }

        // Streaming
        if (this.elements.streamingCheck) {
            this.elements.streamingCheck.addEventListener('change', (e) => {
                this.state.streamingEnabled = e.target.checked;
                this.triggerCallback('streamingChange', e.target.checked);
            });
        }

        // Markdown
        if (this.elements.markdownCheck) {
            this.elements.markdownCheck.addEventListener('change', (e) => {
                this.state.markdownEnabled = e.target.checked;
                this.triggerCallback('markdownChange', e.target.checked);
            });
        }

        // Multi-turn
        if (this.elements.multiTurnCheck) {
            this.elements.multiTurnCheck.addEventListener('change', (e) => {
                this.state.multiTurnEnabled = e.target.checked;
                this.triggerCallback('multiTurnChange', e.target.checked);
            });
            // Set initial state
            this.state.multiTurnEnabled = this.elements.multiTurnCheck.checked;
        }

        // Clear chat
        if (this.elements.clearChat) {
            this.elements.clearChat.addEventListener('click', () => {
                this.triggerCallback('clearChat');
            });
        }
    }

    // Callback management
    onProviderChange(callback) { this.callbacks.providerChange = callback; }
    onModelChange(callback) { this.callbacks.modelChange = callback; }
    onBroadcastModeChange(callback) { this.callbacks.broadcastModeChange = callback; }
    onStreamingChange(callback) { this.callbacks.streamingChange = callback; }
    onMarkdownChange(callback) { this.callbacks.markdownChange = callback; }
    onMultiTurnChange(callback) { this.callbacks.multiTurnChange = callback; }
    onClearChat(callback) { this.callbacks.clearChat = callback; }

    triggerCallback(event, ...args) {
        if (this.callbacks[event]) {
            this.callbacks[event](...args);
        }
    }

    // UI State Management
    setProcessing(isProcessing) {
        this.state.isProcessing = isProcessing;

        if (this.elements.sendButton) {
            this.elements.sendButton.disabled = isProcessing;
        }

        if (this.elements.sendText && this.elements.sendSpinner) {
            this.elements.sendText.style.display = isProcessing ? 'none' : 'inline';
            this.elements.sendSpinner.style.display = isProcessing ? 'inline-block' : 'none';
        }
    }

    updateBroadcastUI() {
        const isBroadcast = this.state.broadcastMode;

        if (this.elements.sendButton) {
            this.elements.sendButton.classList.toggle('broadcast-mode', isBroadcast);
        }

        if (this.elements.broadcastIndicator) {
            this.elements.broadcastIndicator.style.display = isBroadcast ? 'inline-block' : 'none';
        }

        if (this.elements.sendText) {
            this.elements.sendText.textContent = isBroadcast ? 'Broadcast' : 'Send';
        }
    }

    updateProviderInfo(provider, model) {
        if (this.elements.currentProvider) {
            this.elements.currentProvider.textContent = provider ?
                provider.charAt(0).toUpperCase() + provider.slice(1) :
                'No provider selected';
        }

        if (this.elements.currentModel) {
            this.elements.currentModel.textContent = model || '';
        }
    }

    updateModelSelection(models, defaultModel) {
        if (!this.elements.modelSelect) return;

        this.elements.modelSelect.innerHTML = '<option value="">Select Model...</option>';

        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            this.elements.modelSelect.appendChild(option);
        });

        if (defaultModel) {
            this.elements.modelSelect.value = defaultModel;
        }

        this.elements.modelSelect.disabled = false;
    }

    updateStats(messageCount, tokenCount) {
        if (this.elements.messageCount) {
            this.elements.messageCount.textContent = messageCount;
        }

        if (this.elements.tokenCount) {
            const displayCount = tokenCount > 1000 ?
                `${(tokenCount / 1000).toFixed(1)}k` :
                tokenCount;
            this.elements.tokenCount.textContent = displayCount;
        }
    }

    enableInputs(enabled) {
        if (this.elements.sendButton) {
            this.elements.sendButton.disabled = !enabled;
        }

        if (this.elements.modelSelect) {
            this.elements.modelSelect.disabled = !enabled;
        }
    }

    getSystemMessage() {
        return this.elements.systemMessage ? this.elements.systemMessage.value.trim() : '';
    }

    getState() {
        return { ...this.state,
            multiTurnEnabled: this.elements.multiTurnCheck ? this.elements.multiTurnCheck.checked : true
        };
    }

    showError(message) {
        // Simple error display - you might want to enhance this
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-toast';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 12px 20px;
            border-radius: 5px;
            z-index: 1000;
            max-width: 300px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;

        document.body.appendChild(errorDiv);

        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-toast';
        successDiv.textContent = message;
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 12px 20px;
            border-radius: 5px;
            z-index: 1000;
            max-width: 300px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;

        document.body.appendChild(successDiv);

        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 3000);
    }
}
