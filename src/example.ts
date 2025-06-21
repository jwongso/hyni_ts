/**
 * Complete example demonstrating the usage of GeneralContext with API key management
 * Shows how to work with OpenAI, Claude, DeepSeek, and Mistral providers
 */

import { GeneralContext, SchemaException, ValidationException } from './general_context';
import {
    getApiKeyForProvider,
    setApiKeyForProvider,
    loadApiKeysFromFile,
    loadApiKeysFromURL,
    getConfiguredProviders,
    SecureApiKeyStorage,
    parseHynirc,
    maskApiKey
} from './api-keys';

/**
 * Provider manager class that handles multiple LLM providers
 */
export class LLMProviderManager {
    private contexts: Map<string, GeneralContext> = new Map();
    private schemas: Map<string, any> = new Map();

    constructor(private schemaBaseURL: string = '/schemas') {}

    /**
     * Initialize all providers
     */
    async initializeProviders(): Promise<void> {
        const providers = ['openai', 'claude', 'deepseek', 'mistral'];

        console.log('🚀 Initializing LLM providers...');

        for (const provider of providers) {
            try {
                await this.initializeProvider(provider);
            } catch (error) {
                console.error(`❌ Failed to initialize ${provider}:`, error);
            }
        }

        this.displayProviderStatus();
    }

    /**
     * Initialize a single provider
     */
    async initializeProvider(provider: string): Promise<void> {
        console.log(`📋 Loading schema for ${provider}...`);

        // Load schema
        const schemaURL = `${this.schemaBaseURL}/${provider}.json`;
        const context = await GeneralContext.fromURL(schemaURL);

        // Get API key
        let apiKey = getApiKeyForProvider(provider);

        // If no API key, try to load from secure storage with a default password
        if (!apiKey && typeof window !== 'undefined') {
            try {
                const secureKey = await SecureApiKeyStorage.getSecure(provider, 'default-password');
                if (secureKey) {
                    apiKey = secureKey;
                    console.log(`🔐 Loaded secure API key for ${provider}`);
                }
            } catch (error) {
                console.debug(`No secure key found for ${provider}`);
            }
        }

        if (apiKey) {
            context.setApiKey(apiKey);
            console.log(`✅ ${provider} initialized with API key: ${maskApiKey(apiKey)}`);
        } else {
            console.warn(`⚠️ No API key found for ${provider}`);
        }

        this.contexts.set(provider, context);
        this.schemas.set(provider, context.getSchema());
    }

    /**
     * Display current provider status
     */
    displayProviderStatus(): void {
        console.log('\n📊 Provider Status:');
        console.log('==================');

        const providers = getConfiguredProviders();
        providers.forEach(p => {
            const context = this.contexts.get(p.provider);
            const status = p.hasKey ? '✅' : '❌';
            const keyInfo = p.hasKey ? `(${p.maskedKey})` : '(No key)';
            const models = context ? context.getSupportedModels().length : 0;

            console.log(`${status} ${p.provider.toUpperCase()} ${keyInfo} - ${models} models available`);
        });

        console.log('==================\n');
    }

    /**
     * Get context for a specific provider
     */
    getContext(provider: string): GeneralContext | undefined {
        return this.contexts.get(provider);
    }

    /**
     * Set API key for a provider
     */
    async setProviderApiKey(provider: string, apiKey: string, persistent: boolean = true): Promise<void> {
        // Store the key
        setApiKeyForProvider(provider, apiKey, persistent);

        // Update context if it exists
        const context = this.contexts.get(provider);
        if (context) {
            context.setApiKey(apiKey);
            console.log(`✅ Updated API key for ${provider}`);
        } else {
            // Initialize the provider with the new key
            await this.initializeProvider(provider);
        }
    }

    /**
     * Load API keys from a config file
     */
    async loadKeysFromFile(file: File): Promise<void> {
        console.log(`📁 Loading API keys from ${file.name}...`);

        const content = await file.text();
        const config = parseHynirc(content);

        let loadedCount = 0;
        for (const [key, value] of Object.entries(config)) {
            // Check if this is an API key we recognize
            for (const provider of ['openai', 'claude', 'deepseek', 'mistral']) {
                const envVar = this.getEnvVarForProvider(provider);
                if (key === envVar) {
                    await this.setProviderApiKey(provider, value, true);
                    loadedCount++;
                }
            }
        }

        console.log(`✅ Loaded ${loadedCount} API keys from file`);
        this.displayProviderStatus();
    }

    private getEnvVarForProvider(provider: string): string {
        const mapping: Record<string, string> = {
            'openai': 'OA_API_KEY',
            'claude': 'CL_API_KEY',
            'deepseek': 'DS_API_KEY',
            'mistral': 'MS_API_KEY'
        };
        return mapping[provider] || '';
    }
}

/**
 * Example chat session with a provider
 */
export class ChatSession {
    private context: GeneralContext;
    private conversationHistory: Array<{role: string, content: string}> = [];

    constructor(
        private manager: LLMProviderManager,
        private provider: string
    ) {
        const context = manager.getContext(provider);
        if (!context) {
            throw new Error(`Provider ${provider} not initialized`);
        }
        this.context = context;
    }

    /**
     * Set up the chat session
     */
    setup(systemMessage?: string, model?: string): ChatSession {
        if (systemMessage && this.context.supportsSystemMessages()) {
            this.context.setSystemMessage(systemMessage);
            console.log(`💬 System message set for ${this.provider}`);
        }

        if (model) {
            this.context.setModel(model);
        }

        // Set reasonable defaults
        this.context
            .setParameter('temperature', 0.7)
            .setParameter('max_tokens', 1000);

        return this;
    }

    /**
     * Send a message and get response
     */
    async sendMessage(message: string): Promise<string> {
        console.log(`\n👤 User: ${message}`);

        // Add user message
        this.context.addUserMessage(message);
        this.conversationHistory.push({role: 'user', content: message});

        // Build request
        const request = this.context.buildRequest(false);

        // Make API call
        try {
            const response = await this.makeApiCall(request);
            const assistantMessage = this.context.extractTextResponse(response);

            // Add assistant response to context for multi-turn conversation
            this.context.addAssistantMessage(assistantMessage);
            this.conversationHistory.push({role: 'assistant', content: assistantMessage});

            console.log(`🤖 ${this.provider}: ${assistantMessage.substring(0, 100)}...`);

            return assistantMessage;
        } catch (error) {
            console.error(`❌ Error calling ${this.provider}:`, error);
            throw error;
        }
    }

    /**
     * Send a message with streaming response
     */
    async sendMessageStreaming(message: string, onChunk: (chunk: string) => void): Promise<string> {
        console.log(`\n👤 User: ${message}`);

        // Add user message
        this.context.addUserMessage(message);
        this.conversationHistory.push({role: 'user', content: message});

        // Build request with streaming
        const request = this.context.buildRequest(true);

        // Make streaming API call
        try {
            const fullResponse = await this.makeStreamingApiCall(request, onChunk);

            // Add assistant response to context
            this.context.addAssistantMessage(fullResponse);
            this.conversationHistory.push({role: 'assistant', content: fullResponse});

            return fullResponse;
        } catch (error) {
            console.error(`❌ Streaming error with ${this.provider}:`, error);
            throw error;
        }
    }

    /**
     * Make API call
     */
    private async makeApiCall(request: any): Promise<any> {
        const headers = Object.fromEntries(this.context.getHeaders());

        const response = await fetch(this.context.getEndpoint(), {
            method: 'POST',
            headers,
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error (${response.status}): ${errorText}`);
        }

        return response.json();
    }

    /**
     * Make streaming API call
     */
    private async makeStreamingApiCall(
        request: any,
        onChunk: (chunk: string) => void
    ): Promise<string> {
        const headers = Object.fromEntries(this.context.getHeaders());

        const response = await fetch(this.context.getEndpoint(), {
            method: 'POST',
            headers,
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Streaming API error (${response.status}): ${errorText}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        if (!reader) {
            throw new Error('No response body');
        }

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
                            onChunk(content);
                            fullResponse += content;
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }

        return fullResponse;
    }

    /**
     * Extract content from streaming response based on provider
     */
    private extractStreamingContent(json: any): string {
        // Try different formats based on provider

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

    /**
     * Get conversation history
     */
    getHistory(): Array<{role: string, content: string}> {
        return [...this.conversationHistory];
    }

    /**
     * Clear conversation
     */
    clearConversation(): void {
        this.context.clearUserMessages();
        this.conversationHistory = [];
        console.log('🗑️ Conversation cleared');
    }
}

/**
 * Main example demonstrating all features
 */
export async function runCompleteExample() {
    console.log('🎯 Hyni TypeScript Example - Multi-Provider Chat\n');

    // Initialize provider manager
    const manager = new LLMProviderManager();
    await manager.initializeProviders();

    // Example 1: Chat with OpenAI
    console.log('\n--- Example 1: OpenAI Chat ---');
    try {
        const openaiChat = new ChatSession(manager, 'openai');
        openaiChat.setup('You are a helpful coding assistant.', 'gpt-4');

        await openaiChat.sendMessage('Write a TypeScript function to validate email addresses');
    } catch (error) {
        console.error('OpenAI example failed:', error);
    }

    // Example 2: Chat with Claude
    console.log('\n--- Example 2: Claude Chat ---');
    try {
        const claudeChat = new ChatSession(manager, 'claude');
        claudeChat.setup('You are a creative writer.', 'claude-3-5-sonnet-20241022');

        await claudeChat.sendMessage('Write a haiku about programming');
    } catch (error) {
        console.error('Claude example failed:', error);
    }

    // Example 3: Streaming with DeepSeek
    console.log('\n--- Example 3: DeepSeek Streaming ---');
    try {
        const deepseekChat = new ChatSession(manager, 'deepseek');
        deepseekChat.setup('You are a math tutor.', 'deepseek-chat');

        console.log('🤖 DeepSeek (streaming): ');
        await deepseekChat.sendMessageStreaming(
            'Explain the Pythagorean theorem',
            (chunk) => process.stdout.write(chunk)
        );
        console.log('\n');
    } catch (error) {
        console.error('DeepSeek example failed:', error);
    }

    // Example 4: Multi-turn conversation with Mistral
    console.log('\n--- Example 4: Mistral Multi-turn ---');
    try {
        const mistralChat = new ChatSession(manager, 'mistral');
        mistralChat.setup('You are a philosophy professor.', 'mistral-small-latest');

        await mistralChat.sendMessage('What is consciousness?');
        await mistralChat.sendMessage('How does that relate to artificial intelligence?');
        await mistralChat.sendMessage('Can machines ever be truly conscious?');

        // Show conversation history
        console.log('\n📜 Conversation History:');
        mistralChat.getHistory().forEach((msg, i) => {
            console.log(`${i + 1}. ${msg.role}: ${msg.content.substring(0, 50)}...`);
        });
    } catch (error) {
        console.error('Mistral example failed:', error);
    }
}

/**
 * Interactive example for browser environment
 */
export async function runInteractiveExample() {
    const manager = new LLMProviderManager();
    await manager.initializeProviders();

    // Create UI for API key management
    const createApiKeyUI = () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <div style="padding: 20px; font-family: Arial;">
                <h2>🔑 API Key Management</h2>
                <div id="provider-status"></div>
                <hr>
                <h3>Load Keys from File</h3>
                <input type="file" id="key-file" accept=".hynirc,.txt">
                <hr>
                <h3>Set Individual Keys</h3>
                <div id="key-inputs"></div>
            </div>
        `;
        document.body.appendChild(container);

        // Update provider status
        updateProviderStatus();

        // File input handler
        const fileInput = document.getElementById('key-file') as HTMLInputElement;
        fileInput.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                await manager.loadKeysFromFile(file);
                updateProviderStatus();
            }
        });

        // Create input fields for each provider
        const keyInputsDiv = document.getElementById('key-inputs')!;
        ['openai', 'claude', 'deepseek', 'mistral'].forEach(provider => {
            const div = document.createElement('div');
            div.style.marginBottom = '10px';
            div.innerHTML = `
                <label>${provider.toUpperCase()}: </label>
                <input type="password" id="key-${provider}" placeholder="Enter API key">
                <button onclick="setKey('${provider}')">Set</button>
                <button onclick="setKeySecure('${provider}')">Set Secure</button>
            `;
            keyInputsDiv.appendChild(div);
        });

        // Global functions for button handlers
        (window as any).setKey = async (provider: string) => {
            const input = document.getElementById(`key-${provider}`) as HTMLInputElement;
            if (input.value) {
                await manager.setProviderApiKey(provider, input.value, true);
                input.value = '';
                updateProviderStatus();
            }
        };

        (window as any).setKeySecure = async (provider: string) => {
            const input = document.getElementById(`key-${provider}`) as HTMLInputElement;
            if (input.value) {
                const password = prompt('Enter password for secure storage:');
                if (password) {
                    await SecureApiKeyStorage.setSecure(provider, input.value, password);
                    await manager.setProviderApiKey(provider, input.value, false);
                    input.value = '';
                    updateProviderStatus();
                }
            }
        };

        function updateProviderStatus() {
            const statusDiv = document.getElementById('provider-status')!;
            const providers = getConfiguredProviders();

            statusDiv.innerHTML = providers.map(p => `
                <div>
                    ${p.hasKey ? '✅' : '❌'}
                    <strong>${p.provider.toUpperCase()}</strong>:
                    ${p.hasKey ? p.maskedKey : 'Not configured'}
                </div>
            `).join('');
        }
    };

    // Create chat UI
    const createChatUI = () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <div style="padding: 20px; font-family: Arial;">
                <h2>💬 Chat Interface</h2>
                <select id="provider-select">
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="mistral">Mistral</option>
                </select>
                <select id="model-select"></select>
                <button id="clear-btn">Clear</button>
                <div id="chat-messages" style="height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; margin: 10px 0;"></div>
                <textarea id="message-input" style="width: 100%; height: 60px;"></textarea>
                <button id="send-btn">Send</button>
                <label><input type="checkbox" id="streaming-check"> Streaming</label>
            </div>
        `;
        document.body.appendChild(container);

        const providerSelect = document.getElementById('provider-select') as HTMLSelectElement;
        const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
        const messagesDiv = document.getElementById('chat-messages')!;
        const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
        const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
        const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
        const streamingCheck = document.getElementById('streaming-check') as HTMLInputElement;

        let currentChat: ChatSession | null = null;

        // Update models when provider changes
        providerSelect.addEventListener('change', () => {
            const provider = providerSelect.value;
            const context = manager.getContext(provider);

            if (context) {
                modelSelect.innerHTML = context.getSupportedModels()
                    .map(m => `<option value="${m}">${m}</option>`)
                    .join('');

                currentChat = new ChatSession(manager, provider);
                currentChat.setup('You are a helpful assistant.', modelSelect.value);
            }
        });

        // Initialize with first provider
        providerSelect.dispatchEvent(new Event('change'));

        // Send message
        const sendMessage = async () => {
            if (!currentChat || !messageInput.value.trim()) return;

            const message = messageInput.value.trim();
            messageInput.value = '';

            // Add user message to UI
            const userDiv = document.createElement('div');
            userDiv.innerHTML = `<strong>You:</strong> ${message}`;
            userDiv.style.marginBottom = '10px';
            messagesDiv.appendChild(userDiv);

            // Add assistant message container
            const assistantDiv = document.createElement('div');
            assistantDiv.style.marginBottom = '10px';
            messagesDiv.appendChild(assistantDiv);

            try {
                if (streamingCheck.checked && manager.getContext(providerSelect.value)?.supportsStreaming()) {
                    assistantDiv.innerHTML = '<strong>Assistant:</strong> ';
                    await currentChat.sendMessageStreaming(message, (chunk) => {
                        assistantDiv.innerHTML += chunk;
                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    });
                } else {
                    assistantDiv.innerHTML = '<strong>Assistant:</strong> Thinking...';
                    const response = await currentChat.sendMessage(message);
                    assistantDiv.innerHTML = `<strong>Assistant:</strong> ${response}`;
                }
            } catch (error) {
                assistantDiv.innerHTML = `<strong>Error:</strong> ${error}`;
                assistantDiv.style.color = 'red';
            }

            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        };

        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                sendMessage();
            }
        });

        clearBtn.addEventListener('click', () => {
            currentChat?.clearConversation();
            messagesDiv.innerHTML = '';
        });
    };

    // Create the UI
    createApiKeyUI();
    createChatUI();
}

// Auto-run in browser environment
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        console.log('🌐 Running in browser environment');
        runInteractiveExample();
    });
} else {
    // Node.js environment
    runCompleteExample();
}
