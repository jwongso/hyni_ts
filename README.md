# Hyni Chat - Multi-Provider LLM Interface

A powerful, schema-driven TypeScript/JavaScript library for unified interaction with multiple Large Language Model providers. Hyni Chat provides a consistent API across OpenAI, Claude, DeepSeek, Mistral, and other LLM services through JSON schema configuration.

--- 

## ✨ Features
- 🔄 **Multi-Provider Support** - One interface for OpenAI, Claude, DeepSeek, Mistral, and more
- 📋 **Schema-Driven** - JSON schemas define provider capabilities and request formats
- 🌊 **Streaming Support** - Real-time response streaming where supported
- 🖼️ **Multimodal** - Text, image, and audio support for compatible providers
- 🔐 **Secure API Key Management** - Multiple storage options with encryption support
- 📱 **Browser & Node.js** - Works in both environments
- 🎨 **Modern UI** - Beautiful web interface with broadcast messaging
- ⚡ **TypeScript First** - Full type safety and IntelliSense support

## 🚀 Quick Start
### Installation
```html
<!-- Include in your HTML -->
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
## Web Interface
```html
<!DOCTYPE html>
<html>
<head>
    <title>Hyni Chat</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div id="hyni-chat-container"></div>
    
    <script type="module">
        import { HyniChat } from './hyni-chat.js';
        const chat = new HyniChat();
    </script>
</body>
</html>
```
## 🎯 Why Hyni Chat?
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
hyni_ts/
├── index.html              # Web interface
├── styles.css              # UI styling
├── hyni-chat.js           # Main chat application
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
### GeneralContext Methods
Method	Description
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
Function	Description
- setApiKeyForProvider(provider, key, persistent?)	Set API key
- getApiKeyForProvider(provider)	Get API key
- loadApiKeysFromFile(file)	Load from file
- parseHynirc(content)	Parse .hynirc format
- clearAllApiKeys()	Clear all keys

## 🎨 Web Interface Features
- Provider Selection - Easy switching between LLM providers
- Model Selection - Choose from available models per provider
- Broadcast Mode - Send to multiple providers at once
- Streaming Toggle - Enable/disable real-time streaming
- Markdown Rendering - Beautiful formatting of responses
- API Key Management - Secure key storage and loading
- Statistics - Track message and token counts
- Responsive Design - Works on desktop and mobile

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
