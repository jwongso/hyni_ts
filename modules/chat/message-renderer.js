export class MessageRenderer {
    constructor(container) {
        this.container = container;
        this.renderMarkdown = true;
        this.messageElements = new Map();
    }

    setMarkdownEnabled(enabled) {
        this.renderMarkdown = enabled;
    }

    addUserMessage(content) {
        const messageId = this.generateId();
        const element = this.createMessageElement('user', content, null, messageId);
        this.appendMessage(element, messageId);
        return messageId;
    }

    addAssistantMessage(content, provider = null) {
        const messageId = this.generateId();
        const element = this.createMessageElement('assistant', content, provider, messageId);
        this.appendMessage(element, messageId);
        return messageId;
    }

    addSystemMessage(content, type = 'info') {
        const messageId = this.generateId();
        const element = this.createMessageElement(type, content, null, messageId);
        this.appendMessage(element, messageId);
        return messageId;
    }

    addBroadcastMessage(content) {
        const messageId = this.generateId();
        const element = this.createMessageElement('broadcast', content, null, messageId);
        this.appendMessage(element, messageId);
        return messageId;
    }

    createStreamingMessage(provider) {
        const messageId = this.generateId();
        const element = this.createMessageElement('assistant', '', provider, messageId);
        this.appendMessage(element, messageId);
        return {
            messageId,
            updateContent: (content) => this.updateStreamingContent(messageId, content),
            finalize: () => this.finalizeStreamingMessage(messageId)
        };
    }

    updateStreamingContent(messageId, content) {
        const element = this.messageElements.get(messageId);
        if (element) {
            const contentDiv = element.querySelector('.message-content');
            if (contentDiv) {
                contentDiv.textContent = content;
                this.scrollToBottom();
            }
        }
    }

    finalizeStreamingMessage(messageId) {
        const element = this.messageElements.get(messageId);
        if (element) {
            const contentDiv = element.querySelector('.message-content');
            if (contentDiv && this.renderMarkdown) {
                const content = contentDiv.textContent;
                contentDiv.innerHTML = this.renderMarkdownText(content);
            }
        }
    }

    createMessageElement(role, content, provider, messageId) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        messageDiv.dataset.messageId = messageId;

        if (provider) {
            messageDiv.classList.add(provider);
        }

        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';

        const { icon, label } = this.getMessageHeaderInfo(role, provider);
        const time = new Date().toLocaleTimeString();

        headerDiv.innerHTML = `
            <span class="message-icon">${icon}</span>
            <span class="message-label">${label}</span>
            ${provider ? `<span class="provider-badge ${provider}">${provider}</span>` : ''}
            <span class="message-time">${time}</span>
            <div class="message-actions">
                <button class="action-btn copy-btn" onclick="window.messageRenderer.copyMessage('${messageId}')" title="Copy message">
                    📋
                </button>
                ${role === 'assistant' ? `<button class="action-btn regenerate-btn" onclick="window.messageRenderer.regenerateMessage('${messageId}')" title="Regenerate">🔄</button>` : ''}
            </div>
        `;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (this.renderMarkdown && role === 'assistant') {
            contentDiv.innerHTML = this.renderMarkdownText(content);
        } else {
            contentDiv.textContent = content;
        }

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);

        return messageDiv;
    }

    getMessageHeaderInfo(role,provider) {
        const configs = {
            user: { icon: '👤', label: 'You' },
            assistant: { icon: '🤖', label: provider || 'Assistant' },
            system: { icon: 'ℹ️', label: 'System' },
            error: { icon: '❌', label: 'Error' },
            broadcast: { icon: '📡', label: 'Broadcast' },
            info: { icon: 'ℹ️', label: 'Info' }
        };

        return configs[role] || { icon: '💬', label: 'Message' };
    }

    appendMessage(element, messageId) {
        // Clear placeholder if exists
        if (this.container.children.length === 1 &&
            this.container.children[0].style.textAlign === 'center') {
            this.container.innerHTML = '';
        }

        this.container.appendChild(element);
        this.messageElements.set(messageId, element);
        this.scrollToBottom();

        // Limit message history (keep last 50 messages)
        if (this.messageElements.size > 50) {
            const oldestId = this.messageElements.keys().next().value;
            this.removeMessage(oldestId);
        }
    }

    removeMessage(messageId) {
        const element = this.messageElements.get(messageId);
        if (element && element.parentNode) {
            element.remove();
            this.messageElements.delete(messageId);
        }
    }

    clearAllMessages() {
        this.container.innerHTML = `
            <div style="text-align: center; color: #999; padding: 40px;">
                Chat cleared. Start a new conversation.<br>
                <small>You can use text input or voice input (ASR)</small>
            </div>
        `;
        this.messageElements.clear();
    }

    copyMessage(messageId) {
        const element = this.messageElements.get(messageId);
        if (element) {
            const contentDiv = element.querySelector('.message-content');
            if (contentDiv) {
                const text = contentDiv.textContent || contentDiv.innerText;
                navigator.clipboard.writeText(text).then(() => {
                    this.showToast('Message copied to clipboard');
                }).catch(err => {
                    console.error('Failed to copy message:', err);
                });
            }
        }
    }

    regenerateMessage(messageId) {
        // This would trigger a regeneration request
        // Implementation depends on your chat logic
        console.log('Regenerate message:', messageId);
        this.showToast('Regeneration requested');
    }

    renderMarkdownText(text) {
        // Enhanced markdown rendering
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            // Code blocks
            .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
                return `<pre><code class="language-${lang || 'plaintext'}">${code.trim()}</code></pre>`;
            })
            // Inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Bold
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            // Links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
            // Lists
            .replace(/^\* (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>[\s\S]*<\/li>)/g, '<ul>$1</ul>')
            // Line breaks
            .replace(/\n/g, '<br>');

        return html;
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }

    showToast(message) {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1000;
            animation: fadeInOut 3s ease-in-out;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 3000);
    }

    generateId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Add CSS for toast
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(-20px); }
        10%, 90% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-20px); }
    }

    .message-actions {
        margin-left: auto;
        display: flex;
        gap: 5px;
        opacity: 0;
        transition: opacity 0.2s;
    }

    .message:hover .message-actions {
        opacity: 1;
    }

    .action-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px 5px;
        border-radius: 3px;
        font-size: 12px;
    }

    .action-btn:hover {
        background: rgba(0,0,0,0.1);
    }

    .message-time {
        color: #999;
        font-size: 12px;
        margin-left: auto;
        margin-right: 10px;
    }

    .message-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }
`;
document.head.appendChild(style);
