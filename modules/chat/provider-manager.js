export class ProviderManager {
    constructor(chatManager) {
        this.chatManager = chatManager;
        this.activeRequests = new Map();
    }

    async sendToProvider(provider, message, options = {}) {
        const {
            streaming = false,
            systemMessage = '',
            onProgress = null,
            onComplete = null,
            onError = null
        } = options;

        try {
            const context = await this.chatManager.loadProvider(provider);

            if (!context.hasApiKey()) {
                throw new Error('No API key configured');
            }

            // Set system message if provided
            if (systemMessage && context.supportsSystemMessages()) {
                context.setSystemMessage(systemMessage);
            }

            // Add user message to context
            context.addUserMessage(message);

            // Set model if not already set
            const schema = context.getSchema();
            if (schema.models?.default) {
                // Check if model is already set
                const currentModel = context.getCurrentModel ? context.getCurrentModel() : '';
                if (!currentModel) {
                    context.setModel(schema.models.default);
                }
            }

            if (streaming && context.supportsStreaming()) {
                return await this.sendStreamingRequest(provider, context, onProgress, onComplete, onError);
            } else {
                return await this.sendNormalRequest(provider, context, onComplete, onError);
            }

        } catch (error) {
            console.error(`Error with ${provider}:`, error);
            if (onError) {
                onError(error);
            }
            throw error;
        }
    }

    async sendNormalRequest(provider, context, onComplete, onError) {
        const requestId = `${provider}-${Date.now()}`;

        try {
            this.activeRequests.set(requestId, { provider, type: 'normal' });

            const request = context.buildRequest(false);
            const headers = Object.fromEntries(context.getHeaders());

            let endpoint, fetchOptions;

            // Handle Claude proxy
            if (provider === 'claude') {
                endpoint = 'http://localhost:3001/api/proxy/claude';
                fetchOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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

            // Add assistant message to context
            context.addAssistantMessage(text);

            // Update token count
            if (data.usage) {
                this.chatManager.updateTokenCount(data.usage.total_tokens || 0);
            }

            if (onComplete) {
                onComplete(text, data.usage);
            }

            return { text, usage: data.usage };

        } catch (error) {
            if (onError) {
                onError(error);
            }
            throw error;
        } finally {
            this.activeRequests.delete(requestId);
        }
    }

    async sendStreamingRequest(provider, context, onProgress, onComplete, onError) {
        const requestId = `${provider}-${Date.now()}-stream`;

        try {
            this.activeRequests.set(requestId, { provider, type: 'streaming' });

            const request = context.buildRequest(true);
            const headers = Object.fromEntries(context.getHeaders());

            let endpoint, fetchOptions;

            // Handle Claude proxy
            if (provider === 'claude') {
                endpoint = 'http://localhost:3001/api/stream/claude';
                fetchOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
                                if (onProgress) {
                                    onProgress(content, fullText);
                                }
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }

            // Add to context
            context.addAssistantMessage(fullText);

            if (onComplete) {
                onComplete(fullText);
            }

            return { text: fullText };

        } catch (error) {
            if (onError) {
                onError(error);
            }
            throw error;
        } finally {
            this.activeRequests.delete(requestId);
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

    cancelRequest(requestId) {
        if (this.activeRequests.has(requestId)) {
            // In a real implementation, you'd want to abort the fetch request
            this.activeRequests.delete(requestId);
            return true;
        }
        return false;
    }

    getActiveRequests() {
        return Array.from(this.activeRequests.entries());
    }
}
