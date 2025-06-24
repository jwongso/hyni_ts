# Hyni Chat - Multi-Provider LLM Interface with Voice Input

A powerful, schema-driven TypeScript/JavaScript library for unified interaction with multiple Large Language Model providers. Hyni Chat provides a consistent API across OpenAI, Claude, DeepSeek, Mistral, and other LLM services through JSON schema configuration, now with integrated Automatic Speech Recognition (ASR) powered by wstream, based on Whisper.cpp WASM implementation.

--- 

## ✨ Features
- 🎤 **Voice Input with ASR** - Real-time speech recognition using wstream WASM
- 🔄 **Multi-Provider Support** - One interface for OpenAI, Claude, DeepSeek, Mistral, and more
- 📋 **Schema-Driven** - JSON schemas define provider capabilities and request formats
- 🌊 **Streaming Support** - Real-time response streaming where supported
- 🖼️ **Multimodal** - Text, image, and audio support for compatible providers
- 🔐 **Secure API Key Management** - Multiple storage options with encryption support
- 📱 **Browser & Node.js** - Works in both environments
- 🎨 **Modern UI** - Beautiful web interface with broadcast messaging
- ⚡ **TypeScript First** - Full type safety and IntelliSense support
- 🎯 **Multi-turn Conversations** - Maintain context across messages

## 🚀 Quick Start

### Installation
```html
<!-- Include in your HTML -->
<script src="modules/asr/wstream_wasm.js"></script>
<script type="module" src="hyni-chat.js"></script>
```

## Basic Usage
```typescript
import { GeneralContext } from './dist/general_context.js';
import { setApiKeyForProvider } from './dist/api-keys.js';

// Set up API key
setApiKeyForProvider('openai', 'your-api-key-here');

// Load provider schema and create context
const response = await fetch('schemas/openai.json');
const schema = await response.json();
const context = new GeneralContext(schema);

// Configure the context
context
  .setApiKey('your-api-key-here')
  .setModel('gpt-4o')
  .setSystemMessage('You are a helpful assistant')
  .addUserMessage('Hello, how are you?');

// Send message
const request = context.buildRequest();
const apiResponse = await fetch(context.getEndpoint(), {
  method: 'POST',
  headers: Object.fromEntries(context.getHeaders()),
  body: JSON.stringify(request)
});

const data = await apiResponse.json();
const reply = context.extractTextResponse(data);
console.log(reply);
```

## Voice Input with ASR

### Setting up ASR Models
Download Whisper models and place them in the models/ directory:
- ggml-tiny.en.bin - Tiny model (39 MB)
- ggml-tiny.en-q5_1.bin - Tiny Q5_1 (31 MB)
- ggml-base.en.bin - Base model (142 MB)
- ggml-base.en-q5_1.bin - Base Q5_1 (57 MB) - Default

### Using Voice Input
The UI automatically includes voice input mode
Users can switch between text and voice input

Voice input features:
- Real-time transcription as you speak
- Confidence filtering (adjustable threshold)
- Keyboard shortcuts: 'S' to send, 'C' to clear
- Multiple ASR model options
- Continuous transcription (appends to existing text)

## Web Interface with Voice
```html
<!DOCTYPE html>
<html>
<head>
    <title>Hyni Chat with Voice</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <!-- Voice/Text mode switcher included automatically -->
        <div id="hyni-chat-container"></div>
    </div>
    
    <!-- Load ASR WASM module first -->
    <script src="modules/asr/wstream_wasm.js"></script>
    
    <script type="module">
        import { HyniChat } from './hyni-chat.js';
        window.addEventListener('load', async () => {
            window.hyniChat = new HyniChat();
        });
    </script>
</body>
</html>
```
## 🎯 Why Hyni Chat?

### Voice + Multi-Provider = Ultimate Flexibility
- Speak your question once, get answers from multiple AI providers
- Switch between typing and speaking seamlessly
- Compare responses from different models with voice input

Example: Voice broadcast
1. Switch to voice mode
2. Click microphone and speak your question
3. Press 'S' or click "Send Transcription"
4. Enable broadcast mode
5. Get responses from all configured providers

### Before (Multiple SDKs)
```javascript
// OpenAI
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: 'sk-...' });
const openaiResponse = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Claude
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic({ apiKey: 'sk-ant-...' });
const claudeResponse = await anthropic.messages.create({
  model: 'claude-3-opus-20240229',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }]
});

// Different response formats, different error handling...
```

### After (Hyni Chat)
```typescript
// Universal interface for all providers
const providers = ['openai', 'claude', 'deepseek', 'mistral'];

for (const provider of providers) {
  const schema = await loadSchema(`schemas/${provider}.json`);
  const context = new GeneralContext(schema)
    .setApiKey(getApiKey(provider))
    .addUserMessage('Hello, how are you?');
  
  const response = await sendMessage(context);
  console.log(`${provider}: ${context.extractTextResponse(response)}`);
}
```

## 🔧 Core Components
### GeneralContext
The main class that provides a unified interface across all LLM providers:

```typescript
const context = new GeneralContext(schema)
  .setModel('gpt-4o')
  .setSystemMessage('You are a coding assistant')
  .setParameter('temperature', 0.7)
  .setParameter('max_tokens', 2048)
  .addUserMessage('Write a Python function to sort a list');

// Build provider-specific request
const request = context.buildRequest(streaming = false);

// Extract response consistently
const text = context.extractTextResponse(apiResponse);
```
### Schema-Driven Configuration
Each provider is defined by a JSON schema that specifies:

```json
{
  "provider": {
    "name": "openai",
    "display_name": "OpenAI Chat"
  },
  "api": {
    "endpoint": "https://api.openai.com/v1/chat/completions",
    "method": "POST"
  },
  "models": {
    "available": ["gpt-4o", "gpt-4", "gpt-3.5-turbo"],
    "default": "gpt-4o"
  },
  "features": {
    "streaming": true,
    "multimodal": true,
    "system_messages": true
  }
}
```
### API Key Management
Secure, flexible API key storage:

```typescript
import { 
  setApiKeyForProvider, 
  getApiKeyForProvider,
  loadApiKeysFromFile 
} from './dist/api-keys.js';

// Set keys programmatically
setApiKeyForProvider('openai', 'sk-...', persistent: true);

// Load from .hynirc file
await loadApiKeysFromFile(file);

// Encrypted storage
await SecureApiKeyStorage.setSecure('openai', 'sk-...', 'password');
```

---

## 🌟 Advanced Features
### Broadcast Messaging
Send the same message to multiple providers simultaneously:

```typescript
const providers = ['openai', 'claude', 'deepseek'];
const message = 'Explain quantum computing';

// Broadcast to all providers
const responses = await Promise.all(
  providers.map(provider => sendToProvider(provider, message))
);

// Compare responses from different models
responses.forEach((response, i) => {
  console.log(`${providers[i]}: ${response}`);
});
```
## Streaming Support
### Real-time response streaming:

```typescript
const context = new GeneralContext(schema)
  .addUserMessage('Write a long story about space exploration');

const response = await fetch(context.getEndpoint(), {
  method: 'POST',
  headers: Object.fromEntries(context.getHeaders()),
  body: JSON.stringify(context.buildRequest(streaming: true))
});

const reader = response.body.getReader();
// Process streaming chunks...
```
### Multimodal Support
Handle text, images, and audio:

```typescript
// Add image to message
context.addUserMessage(
  'Describe this image',
  'image/jpeg',
  base64ImageData
);

// Check multimodal support
if (context.supportsMultimodal()) {
  // Provider supports images/audio
}
```
### Parameter Validation
Built-in validation based on provider schemas:

```typescript
// Automatic validation
context.setParameter('temperature', 2.5); // ❌ Throws ValidationException

context.setParameter('temperature', 0.7); // ✅ Valid

// Check validation
const errors = context.getValidationErrors();
if (errors.length > 0) {
  console.log('Validation errors:', errors);
}
```

---

## 🏗️ Project Structure
```
hyni-chat/
├── index.html              # Web interface
├── styles.css              # UI styling
├── hyni-chat.js           # Main chat application
├── modules/
│   ├── asr/               # ASR components
│   │   ├── wstream-asr.js # ASR wrapper
│   │   ├── wstream_wasm.js # Whisper WASM
│   │   └── wstream_wasm.wasm
│   ├── chat/              # Chat components
│   │   ├── chat-manager.js
│   │   ├── provider-manager.js
│   │   └── message-renderer.js
│   └── ui/                # UI components
│       ├── input-manager.js # Handles text/voice input
│       └── ui-controller.js
├── models/                # Whisper models
│   ├── ggml-tiny.en.bin
│   ├── ggml-base.en.bin
│   └── ...
├── dist/
│   ├── general_context.js  # Core context class
│   └── api-keys.js        # API key management
├── schemas/               # Provider schemas
│   ├── openai.json
│   ├── claude.json
│   ├── deepseek.json
│   └── mistral.json
└── README.md
```
## 📚 API Reference

### Voice Input Methods
- switchMode('voice')	Switch to voice input mode
- toggleVoiceInput()	Start/stop recording
- setConfidenceThreshold(value)	Set ASR confidence filter
- changeASRModel(path)	Change Whisper model
- clearTranscription()	Clear current transcription
- useTranscription()	Send transcribed text

### Keyboard Shortcuts (Voice Mode)
- S	Send transcription
- C	Clear transcription

### GeneralContext Methods
- setModel(model)	Set the model to use
- setSystemMessage(text)	Set system message
- setParameter(key, value)	Set request parameter
- addUserMessage(text)	Add user message
- addAssistantMessage(text)	Add assistant message
- buildRequest(streaming?)	Build provider request
- extractTextResponse(response)	Extract text from response
- supportsStreaming()	Check streaming support
- supportsMultimodal()	Check multimodal support
- getValidationErrors()	Get validation errors

### API Key Functions
- setApiKeyForProvider(provider, key, persistent?)	Set API key
- getApiKeyForProvider(provider)	Get API key
- loadApiKeysFromFile(file)	Load from file
- parseHynirc(content)	Parse .hynirc format
- clearAllApiKeys()	Clear all keys

### 🎨 Web Interface Features
- Provider Selection - Easy switching between LLM providers
- Model Selection - Choose from available models per provider
- Broadcast Mode - Send to multiple providers at once
- Streaming Toggle - Enable/disable real-time streaming
- Markdown Rendering - Beautiful formatting of responses
- API Key Management - Secure key storage and loading
- Statistics - Track message and token counts
- Responsive Design - Works on desktop and mobile
- Text Input - Traditional typing with Ctrl+Enter to send
- Voice Input - Click-to-talk with real-time transcription
- Mode Switching - Seamless switch between text and voice

### Voice Features
- Live Transcription - See words as they're recognized
- Confidence Filtering - Adjust accuracy threshold
- Model Selection - Choose ASR model based on needs
- Keyboard Shortcuts - Quick actions without clicking
- Continuous Speech - Transcription appends naturally

### Chat Features
- Provider Selection - Easy switching between LLM providers
- Model Selection - Choose from available models per provider
- Broadcast Mode - Send to multiple providers at once
- Streaming Toggle - Enable/disable real-time streaming
- Multi-turn Toggle - Control conversation context
- Markdown Rendering - Beautiful formatting of responses
- API Key Management - Secure key storage and loading
- Statistics - Track message and token counts

## 🔒 Security
- Local Storage - API keys stored in browser localStorage
- Session Storage - Temporary keys for current session
- Encryption Support - Optional encrypted key storage
- No Server Required - Fully client-side application
- CORS Proxy - Optional proxy for providers requiring it

## 🤝 Contributing
- Fork the repository
- Create your feature branch (git checkout -b feature/amazing-feature)
- Commit your changes (git commit -m 'Add amazing feature')
- Push to the branch (git push origin feature/amazing-feature)
- Open a Pull Request

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments
- Built with modern web standards and TypeScript
- Inspired by the need for unified LLM interfaces
- Schema-driven approach for maximum flexibility
- Community-driven provider support

## Start chatting with multiple AI providers today! 🚀
