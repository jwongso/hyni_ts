import { GeneralContext } from './dist/general_context.js';
import {
    getApiKeyForProvider,
    setApiKeyForProvider,
    loadApiKeysFromFile,
    parseHynirc,
    maskApiKey
} from './dist/api-keys.js';

export class HyniChat {
    constructor() {
        this.contexts = new Map();
        this.currentProvider = null;
        this.currentContext = null;
        this.messageCount = 0;
        this.tokenCount = 0;
        this.isProcessing = false;
        this.activeBroadcasts = new Set();

        this.initializeUI();
        this.loadProviderKeys();
    }

    initializeUI() {
        // Provider selection
        const providerSelect = document.getElementById('provider-select');
        providerSelect.addEventListener('change', (e) => this.onProviderChange(e.target.value));

        // Model selection
        const modelSelect = document.getElementById('model-select');
        modelSelect.addEventListener('change', (e) => this.onModelChange(e.target.value));

        // Send button
        const sendButton = document.getElementById('send-button');
        sendButton.addEventListener('click', () => this.sendMessage());

        // Input field
        const chatInput = document.getElementById('chat-input');
        chatInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Clear chat
        document.getElementById('clear-chat').addEventListener('click', () => this.clearChat());

        // File upload
        document.getElementById('file-input').addEventListener('change', (e) => this.loadKeysFromFile(e));

        // Broadcast checkbox
        const broadcastCheck = document.getElementById('broadcast-check');
        broadcastCheck.addEventListener('change', (e) => {
            this.updateBroadcastUI(e.target.checked);
        });

        // Initialize API key UI
        this.updateApiKeysUI();
    }

    updateBroadcastUI(isBroadcast) {
        const sendButton = document.getElementById('send-button');
        const broadcastIndicator = document.getElementById('broadcast-indicator');
        const providerSelect = document.getElementById('provider-select');
        const modelSelect = document.getElementById('model-select');

        if (isBroadcast) {
            sendButton.classList.add('broadcast-mode');
            broadcastIndicator.style.display = 'inline-block';
            document.getElementById('send-text').textContent = 'Broadcast';

            // Check if any provider has API key
            const hasAnyKey = this.getConfiguredProviders().length > 0;
            document.getElementById('chat-input').disabled = !hasAnyKey;
            sendButton.disabled = !hasAnyKey;

            if (!hasAnyKey) {
                this.showMessage('system', 'Please configure at least one API key to use broadcast mode.');
            }
        } else {
            sendButton.classList.remove('broadcast-mode');
            broadcastIndicator.style.display = 'none';
            document.getElementById('send-text').textContent = 'Send';

            // Restore normal state based on current provider
            if (this.currentContext) {
                const hasKey = this.currentContext.hasApiKey();
                document.getElementById('chat-input').disabled = !hasKey;
                sendButton.disabled = !hasKey;
            }
        }
    }

    getConfiguredProviders() {
        const providers = ['openai', 'claude', 'deepseek', 'mistral'];
        return providers.filter(provider => {
            const apiKey = getApiKeyForProvider(provider);
            return !!apiKey;
        });
    }

    async onProviderChange(provider) {
        const broadcastMode = document.getElementById('broadcast-check').checked;

        if (!provider && !broadcastMode) {
            this.currentProvider = null;
            this.currentContext = null;
            document.getElementById('current-provider').textContent = 'No provider selected';
            document.getElementById('current-model').textContent = '';
            document.getElementById('chat-input').disabled = true;
            document.getElementById('send-button').disabled = true;
            document.getElementById('model-select').disabled = true;
            return;
        }

        if (!broadcastMode) {
            this.currentProvider = provider;
            document.getElementById('current-provider').textContent = provider.charAt(0).toUpperCase() + provider.slice(1);

            // Load schema and create context
            try {
                let context = this.contexts.get(provider);

                if (!context) {
                    const response = await fetch(`schemas/${provider}.json`);
                    if (!response.ok) {
                        throw new Error(`Failed to load schema: ${response.statusText}`);
                    }
                    const schema = await response.json();
                    context = new GeneralContext(schema);
                    this.contexts.set(provider, context);
                }

                this.currentContext = context;

                // Set API key if available
                const apiKey = getApiKeyForProvider(provider);
                if (apiKey) {
                    context.setApiKey(apiKey);
                }

                // Update model selection
                this.updateModelSelection(context);

                // Enable/disable UI based on API key
                const hasKey = context.hasApiKey();
                document.getElementById('chat-input').disabled = !hasKey;
                document.getElementById('send-button').disabled = !hasKey;
                document.getElementById('model-select').disabled = !hasKey;

                if (!hasKey) {
                    this.showMessage('system', `Please enter your API key for ${provider} to start chatting.`);
                }

            } catch (error) {
                console.error('Error loading provider:', error);
                this.showMessage('error', `Failed to load provider: ${error.message}`);
            }
        }
    }

    updateModelSelection(context) {
        const modelSelect = document.getElementById('model-select');
        const models = context.getSupportedModels();

        modelSelect.innerHTML = '<option value="">Select Model...</option>';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
        });

        // Select default model
        const schema = context.getSchema();
        if (schema.models?.default) {
            modelSelect.value = schema.models.default;
            context.setModel(schema.models.default);
            document.getElementById('current-model').textContent = schema.models.default;
        }
    }

    onModelChange(model) {
        if (this.currentContext && model) {
            this.currentContext.setModel(model);
            document.getElementById('current-model').textContent = model;
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

        // Update context if it's the current provider
        if (this.currentProvider === provider && this.currentContext) {
            this.currentContext.setApiKey(apiKey);
            document.getElementById('chat-input').disabled = false;
            document.getElementById('send-button').disabled = false;
            document.getElementById('model-select').disabled = false;
        }

        // Update broadcast mode availability
        const broadcastCheck = document.getElementById('broadcast-check');
        if (broadcastCheck.checked) {
            this.updateBroadcastUI(true);
        }

        this.updateApiKeysUI();
        this.showMessage('system', `API key set for ${provider}`);
    }

    removeApiKey(provider) {
        localStorage.removeItem(`hyni_${this.getEnvVar(provider)}`);
        sessionStorage.removeItem(`hyni_${this.getEnvVar(provider)}`);

        if (this.currentProvider === provider) {
            document.getElementById('chat-input').disabled = true;
            document.getElementById('send-button').disabled = true;
        }

        // Update broadcast mode availability
        const broadcastCheck = document.getElementById('broadcast-check');
        if (broadcastCheck.checked) {
            this.updateBroadcastUI(true);
        }

        this.updateApiKeysUI();
        this.showMessage('system', `API key removed for ${provider}`);
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
            this.showMessage('system', 'API keys loaded from file');

            // Update current context if needed
            if (this.currentProvider && this.currentContext) {
                const apiKey = getApiKeyForProvider(this.currentProvider);
                if (apiKey) {
                    this.currentContext.setApiKey(apiKey);
                    document.getElementById('chat-input').disabled = false;
                    document.getElementById('send-button').disabled = false;
                    document.getElementById('model-select').disabled = false;
                }
            }

            // Update broadcast mode availability
            const broadcastCheck = document.getElementById('broadcast-check');
            if (broadcastCheck.checked) {
                this.updateBroadcastUI(true);
            }
        } catch (error) {
            this.showMessage('error', `Failed to load keys: ${error.message}`);
        }
    }

    loadProviderKeys() {
        // Check URL parameters for API keys (useful for demos)
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

    async sendMessage() {
        const broadcastMode = document.getElementById('broadcast-check').checked;

        if (broadcastMode) {
            await this.broadcastMessage();
        } else {
            await this.sendSingleMessage();
        }
    }

    async broadcastMessage() {
        if (this.isProcessing) return;

        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message) return;

        const configuredProviders = this.getConfiguredProviders();
        if (configuredProviders.length === 0) {
            this.showMessage('error', 'No providers configured. Please set API keys first.');
            return;
        }

        this.isProcessing = true;
        input.value = '';

        // Update UI
        document.getElementById('send-button').disabled = true;
        document.getElementById('send-text').style.display = 'none';
        document.getElementById('send-spinner').style.display = 'inline-block';

        // Add user message
        this.showMessage('user', message);
        this.messageCount++;

        // Show broadcast notification
        this.showMessage('broadcast', `Broadcasting to ${configuredProviders.length} providers: ${configuredProviders.join(', ')}`);

        // Send to all configured providers
        const promises = configuredProviders.map(provider =>
            this.sendToProvider(provider, message)
        );

        // Wait for all responses
        await Promise.allSettled(promises);

        this.messageCount += configuredProviders.length;
        this.updateStats();

        // Reset UI
        this.isProcessing = false;
        document.getElementById('send-button').disabled = false;
        document.getElementById('send-text').style.display = 'inline';
        document.getElementById('send-spinner').style.display = 'none';
    }

    async sendToProvider(provider, message) {
        try {
            // Load or get context for provider
            let context = this.contexts.get(provider);

            if (!context) {
                const response = await fetch(`schemas/${provider}.json`);
                if (!response.ok) {
                    throw new Error(`Failed to load schema: ${response.statusText}`);
                }
                const schema = await response.json();
                context = new GeneralContext(schema);
                this.contexts.set(provider, context);
            }

            // Set API key
            const apiKey = getApiKeyForProvider(provider);
            if (apiKey) {
                context.setApiKey(apiKey);
            } else {
                throw new Error('No API key configured');
            }

            // Set default model
            const schema = context.getSchema();
            if (schema.models?.default) {
                context.setModel(schema.models.default);
            }

            // Set system message if provided
            const systemMessage = document.getElementById('system-message').value.trim();
            if (systemMessage && context.supportsSystemMessages()) {
                context.setSystemMessage(systemMessage);
            }

            // Add user message to context
            context.addUserMessage(message);

            // Check if streaming is enabled and supported
            const useStreaming = document.getElementById('streaming-check').checked &&
                               context.supportsStreaming();

            if (useStreaming) {
                await this.sendProviderStreamingMessage(provider, context);
            } else {
                await this.sendProviderNormalMessage(provider, context);
            }

        } catch (error) {
            console.error(`Error with ${provider}:`, error);
            this.showProviderMessage(provider, 'error', `Error: ${error.message}`);
        }
    }

    async sendProviderNormalMessage(provider, context) {
        const request = context.buildRequest(false);
        const headers = Object.fromEntries(context.getHeaders());

        let endpoint;
        let fetchOptions;

        // Use proxy for Claude
        if (provider === 'claude') {
            endpoint = 'http://localhost:3001/api/proxy/claude';
            fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    endpoint: context.getEndpoint(),
                    headers: headers,
                    body: request
                })
            };
        } else {
            endpoint = context.getEndpoint();
            fetchOptions = {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(request)
            };
        }

        const response = await fetch(endpoint, fetchOptions);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const text = context.extractTextResponse(data);

        // Add assistant message to context for multi-turn
        context.addAssistantMessage(text);

        this.showProviderMessage(provider, 'assistant', text);

        // Update token count if available
        if (data.usage) {
            this.tokenCount += (data.usage.total_tokens || 0);
        }
    }

    async sendProviderStreamingMessage(provider, context) {
        const request = context.buildRequest(true);
        const headers = Object.fromEntries(context.getHeaders());

        let endpoint;
        let fetchOptions;

        // Use proxy for Claude
        if (provider === 'claude') {
            endpoint = 'http://localhost:3001/api/stream/claude';
            fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    endpoint: context.getEndpoint(),
                    headers: headers,
                    body: request
                })
            };
        } else {
            endpoint = context.getEndpoint();
            fetchOptions = {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(request)
            };
        }

        const response = await fetch(endpoint, fetchOptions);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error (${response.status}): ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Create assistant message container
        const messageDiv = this.createProviderMessageElement(provider, 'assistant', '');
        const contentDiv = messageDiv.querySelector('.message-content');
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const json = JSON.parse(data);
                        const content = this.extractStreamingContent(json);
                        if (content) {
                            fullText += content;
                            contentDiv.textContent = fullText;
                            this.scrollToBottom();
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }

        // Add to context for multi-turn
        context.addAssistantMessage(fullText);

        // Render markdown if enabled
        if (document.getElementById('markdown-check').checked) {
            contentDiv.innerHTML = this.renderMarkdown(fullText);
        }
    }

    async sendSingleMessage() {
        if (this.isProcessing || !this.currentContext) return;

        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message) return;

        this.isProcessing = true;
        input.value = '';

        // Update UI
        document.getElementById('send-button').disabled = true;
        document.getElementById('send-text').style.display = 'none';
        document.getElementById('send-spinner').style.display = 'inline-block';

        // Add user message
        this.showMessage('user', message);
        this.messageCount++;

        try {
            // Set system message if provided
            const systemMessage = document.getElementById('system-message').value.trim();
            if (systemMessage && this.currentContext.supportsSystemMessages()) {
                this.currentContext.setSystemMessage(systemMessage);
            }

            // Add user message to context
            this.currentContext.addUserMessage(message);

            // Check if streaming is enabled
            const useStreaming = document.getElementById('streaming-check').checked &&
                               this.currentContext.supportsStreaming();

            if (useStreaming) {
                await this.sendStreamingMessage();
            } else {
                await this.sendNormalMessage();
            }

            this.messageCount++;
            this.updateStats();

        } catch (error) {
            console.error('Error sending message:', error);
            this.showMessage('error', `Error: ${error.message}`);
        } finally {
            this.isProcessing = false;
            document.getElementById('send-button').disabled = false;
            document.getElementById('send-text').style.display = 'inline';
            document.getElementById('send-spinner').style.display = 'none';
        }
    }

    async sendNormalMessage() {
        const request = this.currentContext.buildRequest(false);
        const headers = Object.fromEntries(this.currentContext.getHeaders());

        let endpoint;
        let fetchOptions;

        // Use proxy for Claude
        if (this.currentProvider === 'claude') {
            endpoint = 'http://localhost:3001/api/proxy/claude';
            fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    endpoint: this.currentContext.getEndpoint(),
                    headers: headers,
                    body: request
                })
            };
        } else {
            endpoint = this.currentContext.getEndpoint();
            fetchOptions = {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(request)
            };
        }

        const response = await fetch(endpoint, fetchOptions);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const text = this.currentContext.extractTextResponse(data);

        // Add assistant message to context for multi-turn
        this.currentContext.addAssistantMessage(text);

        this.showMessage('assistant', text);

        // Update token count if available
        if (data.usage) {
            this.tokenCount += (data.usage.total_tokens || 0);
        }
    }

    async sendStreamingMessage() {
        const request = this.currentContext.buildRequest(true);
        const headers = Object.fromEntries(this.currentContext.getHeaders());

        let endpoint;
        let fetchOptions;

        // Use proxy for Claude
        if (this.currentProvider === 'claude') {
            endpoint = 'http://localhost:3001/api/stream/claude';
            fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    endpoint: this.currentContext.getEndpoint(),
                    headers: headers,
                    body: request
                })
            };
        } else {
            endpoint = this.currentContext.getEndpoint();
            fetchOptions = {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(request)
            };
        }

        const response = await fetch(endpoint, fetchOptions);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error (${response.status}): ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Create assistant message container
        const messageDiv = this.createMessageElement('assistant', '');
        const contentDiv = messageDiv.querySelector('.message-content');
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const json = JSON.parse(data);
                        const content = this.extractStreamingContent(json);
                        if (content) {
                            fullText += content;
                            contentDiv.textContent = fullText;
                            this.scrollToBottom();
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }

        // Add to context for multi-turn
        this.currentContext.addAssistantMessage(fullText);

        // Render markdown if enabled
        if (document.getElementById('markdown-check').checked) {
            contentDiv.innerHTML = this.renderMarkdown(fullText);
        }
    }

    extractStreamingContent(json) {
        // OpenAI/DeepSeek format
        if (json.choices?.[0]?.delta?.content) {
            return json.choices[0].delta.content;
        }

        // Claude format
        if (json.delta?.text) {
            return json.delta.text;
        }

        // Mistral format
        if (json.choices?.[0]?.delta?.content !== undefined) {
            return json.choices[0].delta.content;
        }

        return '';
    }

    showMessage(role, content) {
        const element = this.createMessageElement(role, content);
        this.scrollToBottom();
    }

    showProviderMessage(provider, role, content) {
        const element = this.createProviderMessageElement(provider, role, content);
        this.scrollToBottom();
    }

    createProviderMessageElement(provider, role, content) {
        const messagesContainer = document.getElementById('chat-messages');

        // Clear placeholder if exists
        if (messagesContainer.children.length === 1 &&
            messagesContainer.children[0].style.textAlign === 'center') {
            messagesContainer.innerHTML = '';
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role} ${provider}`;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';

        const icon = role === 'assistant' ? '🤖' : role === 'error' ? '❌' : 'ℹ️';
        const label = provider.charAt(0).toUpperCase() + provider.slice(1);
        const time = new Date().toLocaleTimeString();

        headerDiv.innerHTML = `
            <span>${icon}</span>
            <span>${label}</span>
            <span class="provider-badge ${provider}">${provider}</span>
            <span style="color: #999; font-size: 12px;">${time}</span>
        `;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (document.getElementById('markdown-check').checked && role === 'assistant') {
            contentDiv.innerHTML = this.renderMarkdown(content);
        } else {
            contentDiv.textContent = content;
        }

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);

        return messageDiv;
    }

    createMessageElement(role, content) {
        const messagesContainer = document.getElementById('chat-messages');

        // Clear placeholder if exists
        if (messagesContainer.children.length === 1 &&
            messagesContainer.children[0].style.textAlign === 'center') {
            messagesContainer.innerHTML = '';
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';

        const icon = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : role === 'error' ? '❌' : role === 'broadcast' ? '📡' : 'ℹ️';
        const label = role === 'user' ? 'You' : role === 'assistant' ? this.currentProvider : role.charAt(0).toUpperCase() + role.slice(1);
        const time = new Date().toLocaleTimeString();

        headerDiv.innerHTML = `
            <span>${icon}</span>
            <span>${label}</span>
            <span style="color: #999; font-size: 12px;">${time}</span>
        `;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (document.getElementById('markdown-check').checked && role === 'assistant') {
            contentDiv.innerHTML = this.renderMarkdown(content);
        } else {
            contentDiv.textContent = content;
        }

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);

        return messageDiv;
    }

    renderMarkdown(text) {
        // Simple markdown rendering
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
                return `<pre><code class="language-${lang || 'plaintext'}">${code.trim()}</code></pre>`;
            })
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');

        return html;
    }

    clearChat() {
        if (confirm('Clear all messages?')) {
            document.getElementById('chat-messages').innerHTML = `
                <div style="text-align: center; color: #999; padding: 40px;">
                    Chat cleared. Start a new conversation.
                </div>
            `;

            // Clear all contexts
            this.contexts.forEach(context => {
                context.clearUserMessages();
            });

            if (this.currentContext) {
                this.currentContext.clearUserMessages();
            }

            this.messageCount = 0;
            this.tokenCount = 0;
            this.updateStats();
        }
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    updateStats() {
        document.getElementById('message-count').textContent = this.messageCount;
        document.getElementById('token-count').textContent = this.tokenCount > 1000 ?
            `${(this.tokenCount / 1000).toFixed(1)}k` : this.tokenCount;
    }
}
