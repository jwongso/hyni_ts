export class WStreamASRModule {
    constructor() {
        this.handle = null;
        this.Module = null;
        this.isInitialized = false;
        this.isRecording = false;
        this.transcriptionCallback = null;
        this.statusCallback = null;

        // Audio settings
        this.kSampleRate = 16000;
        this.kIntervalAudio_ms = 3000;
        this.context = null;
        this.mediaRecorder = null;
        this.currentStream = null;
    }

    async initialize(modelPath = '/models/ggml-base.en.bin') {
        try {
            if (this.statusCallback) {
                this.statusCallback('loading', 'Loading WASM module...');
            }

            // Load WASM module
            this.Module = await window.WStreamModule();

            // Load model
            const response = await fetch(modelPath);
            if (!response.ok) {
                throw new Error(`Failed to load model: ${response.statusText}`);
            }

            const modelData = await response.arrayBuffer();

            if (this.statusCallback) {
                this.statusCallback('loading', 'Initializing Whisper...');
            }

            // Write model to filesystem
            const modelFileName = modelPath.split('/').pop();
            const tempPath = `/tmp/${modelFileName}`;

            try {
                this.Module.FS.mkdir('/tmp');
            } catch (e) {
                // Directory might already exist
            }

            const uint8Array = new Uint8Array(modelData);
            this.Module.FS.writeFile(tempPath, uint8Array);

            // Initialize whisper
            this.handle = this.Module.init(tempPath);

            if (!this.handle) {
                throw new Error('Failed to initialize Whisper');
            }

            this.isInitialized = true;

            // Start polling for transcriptions
            this.startPolling();

            if (this.statusCallback) {
                this.statusCallback('ready', 'ASR Ready');
            }

            return true;

        } catch (error) {
            console.error('[ASR] Initialization error:', error);
            if (this.statusCallback) {
                this.statusCallback('error', `ASR Error: ${error.message}`);
            }
            return false;
        }
    }

    setTranscriptionCallback(callback) {
        this.transcriptionCallback = callback;
    }

    setStatusCallback(callback) {
        this.statusCallback = callback;
    }

    async startRecording() {
        if (!this.isInitialized || this.isRecording) return;

        // Create audio context
        if (!this.context || this.context.state === 'closed') {
            this.context = new AudioContext({
                sampleRate: this.kSampleRate,
                channelCount: 1,
                echoCancellation: false,
                autoGainControl: true,
                noiseSuppression: true,
                latency: 'interactive'
            });
        }

        this.isRecording = true;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: this.kSampleRate,
                    sampleSize: 16,
                    echoCancellation: false,
                    autoGainControl: true,
                    noiseSuppression: true,
                    latency: 0
                }
            });

            this.currentStream = stream;
            this.setupMediaRecorder(stream);

            if (this.statusCallback) {
                this.statusCallback('recording', 'Recording...');
            }

        } catch (error) {
            console.error('[ASR] Error getting audio stream:', error);
            this.isRecording = false;
            if (this.statusCallback) {
                this.statusCallback('error', `Microphone Error: ${error.message}`);
            }
        }
    }

    stopRecording() {
        this.isRecording = false;

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }

        if (this.statusCallback) {
            this.statusCallback('ready', 'ASR Ready');
        }
    }

    setupMediaRecorder(stream) {
        this.mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus'
        });

        let audioChunks = [];

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = async () => {
            if (audioChunks.length > 0 && this.context && this.context.state !== 'closed') {
                const blob = new Blob(audioChunks, { type: 'audio/webm' });
                audioChunks = [];

                try {
                    await this.processAudioBlob(blob);
                } catch (error) {
                    console.error('[ASR] Error processing audio:', error);
                }
            }

            // Continue recording if still active
            if (this.isRecording) {
                setTimeout(() => {
                    if (this.isRecording) {
                        this.setupMediaRecorder(this.currentStream);
                    }
                }, 10);
            }
        };

        this.mediaRecorder.start();

        // Stop and restart at intervals
        setTimeout(() => {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
        }, this.kIntervalAudio_ms);
    }

    async processAudioBlob(blob) {
        if (!this.context || this.context.state === 'closed') return;

        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);

        // Resample if needed
        const resampled = this.resampleAudio(channelData, audioBuffer.sampleRate, this.kSampleRate);

        // Send to WASM
        const result = this.Module.set_audio(this.handle, resampled);
        if (result !== 0) {
            console.error('[ASR] Error pushing audio, result:', result);
        }
    }

    resampleAudio(input, inputSampleRate, outputSampleRate) {
        if (inputSampleRate === outputSampleRate) {
            return new Float32Array(input);
        }

        const ratio = inputSampleRate / outputSampleRate;
        const outputLength = Math.floor(input.length / ratio);
        const output = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            const inputIndex = i * ratio;
            const inputIndexFloor = Math.floor(inputIndex);
            const inputIndexCeil = Math.ceil(inputIndex);
            const fraction = inputIndex - inputIndexFloor;

            if (inputIndexCeil >= input.length) {
                output[i] = input[inputIndexFloor];
            } else {
                output[i] = input[inputIndexFloor] * (1 - fraction) +
                           input[inputIndexCeil] * fraction;
            }
        }

        return output;
    }

    startPolling() {
        setInterval(() => {
            if (!this.handle || !this.isInitialized) return;

            const transcribed = this.Module.get_transcribed(this.handle);
            if (transcribed && transcribed.length > 0 && this.transcriptionCallback) {
                // Get confidence metrics
                let confidence = 100;
                try {
                    const metricsJson = this.Module.get_confidence_metrics(this.handle);
                    const metrics = JSON.parse(metricsJson);
                    confidence = metrics.confidence || 100;

                    // Skip low confidence or empty transcriptions
                    if (confidence === 0 || metrics.n_tokens === 0) {
                        return;
                    }
                } catch (e) {
                    console.error('[ASR] Error parsing metrics:', e);
                }

                this.transcriptionCallback(transcribed, confidence);
            }
        }, 250);
    }

    cleanup() {
        this.stopRecording();

        if (this.context && this.context.state !== 'closed') {
            this.context.close();
            this.context = null;
        }

        if (this.handle && this.Module) {
            this.Module.free_instance(this.handle);
            this.handle = null;
        }
    }
}
