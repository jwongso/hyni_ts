import { WStreamASRModule } from '../asr/wstream-asr.js';

export class InputManager {
    constructor() {
        this.asr = new WStreamASRModule();
        this.inputMode = 'text'; // 'text' or 'voice'
        this.onInputCallback = null;
        this.transcriptionBuffer = '';
        this.confidenceThreshold = 50;

        this.setupUI();
        this.setupASR();
    }

    setupUI() {
        console.log('InputManager: Setting up UI...');
        // Create the dual input UI
        this.createInputUI();

        // Text input events
        this.textInput = document.getElementById('text-input');
        this.textInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                console.log('Ctrl+Enter pressed, submitting text');
                this.submitTextInput();
            }
        });

        // Add click handler for send button in text mode
        const sendButton = document.getElementById('send-button');
        if (sendButton) {
            sendButton.addEventListener('click', () => {
                console.log('Send button clicked');
                this.submitTextInput();
            });
        }

        // Voice input events
        this.voiceButton = document.getElementById('voice-button');
        this.voiceButton.addEventListener('click', () => this.toggleVoiceInput());

        // Mode switcher
        this.modeButtons = document.querySelectorAll('.input-mode-btn');
        this.modeButtons.forEach(btn => {
            btn.addEventListener('click', () => this.switchMode(btn.dataset.mode));
        });

        // ASR model selector
        this.asrModelSelect = document.getElementById('asr-model-select');
        this.asrModelSelect.addEventListener('change', (e) => this.changeASRModel(e.target.value));

        // Confidence filter
        this.confidenceSlider = document.getElementById('confidence-slider');
        this.confidenceSlider.addEventListener('input', (e) => {
            this.confidenceThreshold = parseInt(e.target.value);
            document.getElementById('confidence-value').textContent = `${this.confidenceThreshold}%`;
        });

        // Global keyboard shortcuts for ASR mode
        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts in voice input mode
            if (this.inputMode !== 'voice') return;

            // Don't trigger if user is typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                return;
            }

            switch (e.key.toLowerCase()) {
                case 's':
                    e.preventDefault();
                    this.useTranscription();
                    break;
                case 'c':
                    e.preventDefault();
                    this.clearTranscription();
                    break;
                case 't':
                    e.preventDefault();
                    this.toggleVoiceInput();
                    break;
            }
        });

        window.dispatchEvent(new CustomEvent('inputManagerReady'));
    }

    createInputUI() {
        const inputContainer = document.querySelector('.chat-input-container');
        inputContainer.innerHTML = `
            <div class="input-mode-selector">
                <button class="input-mode-btn active" data-mode="text">
                    <span>⌨️</span> Text
                </button>
                <button class="input-mode-btn" data-mode="voice">
                    <span>🎤</span> Voice
                </button>
            </div>

            <div class="input-panel" id="text-input-panel">
                <div class="chat-input-wrapper">
                    <textarea
                        id="text-input"
                        class="chat-input"
                        placeholder="Type your message here... (Ctrl+Enter to send)"
                    ></textarea>
                    <button id="send-button" class="send-button">
                        <span id="send-text">Send</span>
                        <span id="send-spinner" class="loading-spinner" style="display: none;"></span>
                    </button>
                </div>
            </div>

            <div class="input-panel" id="voice-input-panel" style="display: none;">
                <div class="asr-controls">
                    <div class="asr-settings">
                        <select id="asr-model-select" class="asr-model-select">
                            <option value="/models/ggml-tiny.en.bin">Tiny (39 MB)</option>
                            <option value="/models/ggml-tiny.en-q5_1.bin">Tiny Q5_1 (31 MB)</option>
                            <option value="/models/ggml-base.en.bin">Base (142 MB)</option>
                            <option value="/models/ggml-base.en-q5_1.bin" selected>Base Q5_1 (57 MB)</option>
                        </select>
                        <div class="confidence-filter">
                            <label>Min Confidence:</label>
                            <input type="range" id="confidence-slider" min="0" max="100" value="50">
                            <span id="confidence-value">50%</span>
                        </div>
                    </div>

                    <button id="voice-button" class="voice-button" title="Toggle recording (T)">
                        <span class="mic-icon">🎤</span>
                        <span class="voice-status">Click to speak</span>
                    </button>

                    <div class="transcription-preview" id="transcription-preview">
                        <div class="preview-header">
                            <span>Live Transcription</span>
                        </div>
                        <div class="preview-content" id="preview-content"></div>
                    </div>

                    <div class="voice-actions">
                        <button id="use-transcription" class="btn-primary" disabled>
                            Send Transcription <kbd>S</kbd>
                        </button>
                        <button id="clear-transcription" class="btn-secondary">
                            Clear <kbd>C</kbd>
                        </button>
                    </div>

                    <!-- Add keyboard shortcuts help -->
                    <div class="keyboard-shortcuts-help">
                        <span class="shortcut-item"><kbd>T</kbd> Toggle Recording</span>
                        <span class="shortcut-item"><kbd>S</kbd> Send</span>
                        <span class="shortcut-item"><kbd>C</kbd> Clear</span>
                    </div>
                </div>

                <div class="asr-status" id="asr-status">
                    <span class="status-indicator" id="asr-status-indicator"></span>
                    <span class="status-text" id="asr-status-text">Initializing ASR...</span>
                </div>
            </div>

            <div class="chat-options">
                <div class="checkbox-group">
                    <input type="checkbox" id="broadcast-check">
                    <label for="broadcast-check" title="Send to all configured providers">📡 Broadcast</label>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="streaming-check">
                    <label for="streaming-check">Enable Streaming</label>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="markdown-check" checked>
                    <label for="markdown-check">Render Markdown</label>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="multi-turn-check" checked>
                    <label for="multi-turn-check" title="Keep conversation history">Multi-turn Conversation</label>
                </div>
                <div class="checkbox-group">
                    <input type="text" id="system-message" placeholder="System message (optional)" style="margin-left: 20px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
            </div>
        `;
    }

    async setupASR() {
        // Set callbacks
        this.asr.setTranscriptionCallback((text, confidence) => {
            this.onTranscription(text, confidence);
        });

        this.asr.setStatusCallback((status, message) => {
            this.updateASRStatus(status, message);
        });

        // Initialize with default model
        const defaultModel = this.asrModelSelect.value;
        await this.asr.initialize(defaultModel);

        // Setup use transcription button
        document.getElementById('use-transcription').addEventListener('click', () => {
            this.useTranscription();
        });

        document.getElementById('clear-transcription').addEventListener('click', () => {
            this.clearTranscription();
        });
    }

    switchMode(mode) {
        this.inputMode = mode;

        // Update UI
        this.modeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        document.getElementById('text-input-panel').style.display = mode === 'text' ? 'block' : 'none';
        document.getElementById('voice-input-panel').style.display = mode === 'voice' ? 'block' : 'none';

        // Stop recording if switching away from voice
        if (mode !== 'voice' && this.asr.isRecording) {
            this.asr.stopRecording();
        }
    }

    async toggleVoiceInput() {
        if (!this.asr.isInitialized) {
            alert('ASR is still initializing. Please wait...');
            return;
        }

        const voiceButton = document.getElementById('voice-button');
        voiceButton.classList.add('shortcut-triggered');
        setTimeout(() => {
            voiceButton.classList.remove('shortcut-triggered');
        }, 200);

        if (this.asr.isRecording) {
            this.asr.stopRecording();
            voiceButton.classList.remove('recording');
            voiceButton.querySelector('.voice-status').textContent = 'Click to speak';
        } else {
            await this.asr.startRecording();
            voiceButton.classList.add('recording');
            voiceButton.querySelector('.voice-status').textContent = 'Recording... Click to stop';
        }
    }

    mergeTranscription(existing, newText) {
        if (!this.Module || !this.Module.merge_transcription) {
            // Fallback to simple concatenation if WASM not ready
            return existing + (existing && !existing.endsWith(' ') ? ' ' : '') + newText;
        }

        return this.Module.merge_transcription(existing, newText);
    }

    onTranscription(text, confidence) {
        if (confidence < this.confidenceThreshold) {
            return; // Skip low confidence transcriptions
        }

        // Use WASM merge function for intelligent merging
        if (this.asr && this.asr.mergeTranscription) {
            this.transcriptionBuffer = this.asr.mergeTranscription(this.transcriptionBuffer || '', text, 1);
        } else {
            // Fallback to simple concatenation
            if (this.transcriptionBuffer && !this.transcriptionBuffer.endsWith(' ')) {
                this.transcriptionBuffer += ' ';
            }
            this.transcriptionBuffer += text;
        }

        // Update preview - show as continuous text
        const previewContent = document.getElementById('preview-content');
        previewContent.textContent = this.transcriptionBuffer;
        previewContent.scrollTop = previewContent.scrollHeight;

        // Enable use button
        document.getElementById('use-transcription').disabled = false;
    }

    getConfidenceClass(confidence) {
        if (confidence >= 90) return 'excellent';
        if (confidence >= 75) return 'good';
        if (confidence >= 50) return 'fair';
        return 'poor';
    }

    useTranscription() {
        if (!this.transcriptionBuffer) return;

        // Stop recording
        if (this.asr.isRecording) {
            this.toggleVoiceInput();
        }

        // Visual feedback for keyboard shortcut
        const useButton = document.getElementById('use-transcription');
        useButton.classList.add('shortcut-triggered');
        setTimeout(() => {
            useButton.classList.remove('shortcut-triggered');
        }, 200);

        // Send the transcription
        if (this.onInputCallback) {
            this.onInputCallback(this.transcriptionBuffer);
        }

        // Clear buffer
        this.clearTranscription();
    }

    clearTranscription() {
        // Visual feedback for keyboard shortcut
        const clearButton = document.getElementById('clear-transcription');
        clearButton.classList.add('shortcut-triggered');
        setTimeout(() => {
            clearButton.classList.remove('shortcut-triggered');
        }, 200);

        this.transcriptionBuffer = '';
        document.getElementById('preview-content').innerHTML = '';
        document.getElementById('use-transcription').disabled = true;
    }

    submitTextInput() {
        const text = this.textInput.value.trim();
        if (!text) return;

        if (this.onInputCallback) {
            this.onInputCallback(text);
            this.textInput.value = '';
        }
    }

    updateASRStatus(status, message) {
        const statusIndicator = document.getElementById('asr-status-indicator');
        const statusText = document.getElementById('asr-status-text');

        statusIndicator.className = `status-indicator status-${status}`;
        statusText.textContent = message;
    }

    async changeASRModel(modelPath) {
        // Stop recording if active
        if (this.asr.isRecording) {
            this.asr.stopRecording();
        }

        // Cleanup and reinitialize
        this.asr.cleanup();
        await this.asr.initialize(modelPath);
    }

    setOnInputCallback(callback) {
        this.onInputCallback = callback;
    }

    cleanup() {
        this.asr.cleanup();
    }
}
