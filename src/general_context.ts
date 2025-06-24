/**
 * TypeScript implementation of hyni general_context
 * Matches the C++ implementation for direct comparison with WASM build
 */

// Custom exception types
export class SchemaException extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SchemaException';
    }
}

export class ValidationException extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationException';
    }
}

// Configuration interface matching C++ context_config
export interface ContextConfig {
    enableStreamingSupport?: boolean;
    enableValidation?: boolean;
    enableCaching?: boolean;
    defaultMaxTokens?: number;
    defaultTemperature?: number;
    customParameters?: Record<string, any>;
}

// Type definitions for JSON schema structure
interface SchemaProvider {
    name: string;
    display_name: string;
    version: string;
}

interface SchemaAPI {
    endpoint: string;
    method: string;
    timeout: number;
    max_retries: number;
}

interface SchemaAuthentication {
    type: string;
    key_name: string;
    key_prefix?: string;
    key_placeholder: string;
}

interface SchemaModel {
    available: string[];
    default: string;
}

interface SchemaParameter {
    type: string;
    required: boolean;
    min?: number;
    max?: number;
    default?: any;
    enum?: any[];
    max_items?: number;
    max_length?: number;
}

interface SchemaMessageFormat {
    structure: any;
    content_types: {
        text?: any;
        image?: any;
        audio?: any;
    };
}

interface SchemaResponseFormat {
    success: {
        structure: any;
        content_path: (string | number)[];
        text_path: (string | number)[];
        usage_path?: (string | number)[];
        model_path?: (string | number)[];
        finish_reason_path?: (string | number)[];
    };
    error: {
        structure: any;
        error_path: (string | number)[];
        error_type_path?: (string | number)[];
    };
    stream?: {
        event_types: string[];
        content_delta_path: (string | number)[];
        usage_delta_path?: (string | number)[];
    };
}

interface Schema {
    provider: SchemaProvider;
    api: SchemaAPI;
    authentication: SchemaAuthentication;
    headers: {
        required: Record<string, string>;
        optional?: Record<string, string>;
    };
    models: SchemaModel;
    request_template: any;
    parameters: Record<string, SchemaParameter>;
    message_roles?: string[];
    system_message?: {
        supported: boolean;
        field: string;
        type: string;
        role?: string;
    };
    multimodal?: {
        supported: boolean;
        supported_types: string[];
        image_formats?: string[];
        max_image_size?: number;
        max_images_per_message?: number;
    };
    message_format: SchemaMessageFormat;
    response_format: SchemaResponseFormat;
    features?: {
        streaming?: boolean;
        function_calling?: boolean;
        json_mode?: boolean;
        vision?: boolean;
        system_messages?: boolean;
        message_history?: boolean;
    };
    validation?: {
        required_fields: string[];
        message_validation?: {
            min_messages?: number;
            alternating_roles?: boolean;
            last_message_role?: string;
        };
    };
}

export class GeneralContext {
    private schema: Schema;
    private config: ContextConfig;
    private requestTemplate: any;

    // State
    private providerName: string = '';
    private endpoint: string = '';
    private headers: Map<string, string> = new Map();
    private modelName: string = '';
    private systemMessage?: string;
    private messages: any[] = [];
    private parameters: Map<string, any> = new Map();
    private apiKey: string = '';
    private validRoles: Set<string> = new Set();

    // Cached paths
    private textPath: (string | number)[] = [];
    private errorPath: (string | number)[] = [];
    private messageStructure: any;
    private textContentFormat: any;
    private imageContentFormat: any;

    constructor(schemaOrPath: string | Schema, config: ContextConfig = {}) {
        this.config = {
            enableStreamingSupport: false,
            enableValidation: true,
            enableCaching: true,
            ...config
        };

        if (typeof schemaOrPath === 'string') {
            // In browser context, we'll load via fetch
            throw new Error('String path constructor not supported in browser. Use loadSchema() instead.');
        } else {
            this.schema = schemaOrPath as Schema;
            this.initialize();
        }
    }

    /**
     * Static factory method to load schema from URL
     */
    static async fromURL(url: string, config: ContextConfig = {}): Promise<GeneralContext> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new SchemaException(`Failed to load schema from ${url}: ${response.statusText}`);
        }
        const schema = await response.json();
        return new GeneralContext(schema, config);
    }

    private initialize(): void {
        this.validateSchema();
        this.cacheSchemaElements();
        this.applyDefaults();
        this.buildHeaders();
    }

    private validateSchema(): void {
        const requiredFields = ['provider', 'api', 'request_template',
                               'message_format', 'response_format'];

        for (const field of requiredFields) {
            if (!(field in this.schema)) {
                throw new SchemaException(`Missing required schema field: ${field}`);
            }
        }

        // Validate API configuration
        if (!this.schema.api.endpoint) {
            throw new SchemaException('Missing API endpoint in schema');
        }

        // Validate message format
        if (!this.schema.message_format.structure ||
            !this.schema.message_format.content_types) {
            throw new SchemaException('Invalid message format in schema');
        }

        // Validate response format
        if (!this.schema.response_format.success ||
            !this.schema.response_format.success.text_path) {
            throw new SchemaException('Invalid response format in schema');
        }
    }

    private cacheSchemaElements(): void {
        // Cache provider info
        this.providerName = this.schema.provider.name;
        this.endpoint = this.schema.api.endpoint;

        // Cache valid roles
        if (this.schema.message_roles) {
            this.validRoles = new Set(this.schema.message_roles);
        }

        // Cache request template (deep clone)
        this.requestTemplate = JSON.parse(JSON.stringify(this.schema.request_template));

        // Cache response paths
        this.textPath = this.schema.response_format.success.text_path;
        if (this.schema.response_format.error?.error_path) {
            this.errorPath = this.schema.response_format.error.error_path;
        }

        // Cache message formats
        this.messageStructure = JSON.parse(JSON.stringify(this.schema.message_format.structure));
        if (this.schema.message_format.content_types.text) {
            this.textContentFormat = JSON.parse(JSON.stringify(
                this.schema.message_format.content_types.text
            ));
        }
        if (this.schema.message_format.content_types.image) {
            this.imageContentFormat = JSON.parse(JSON.stringify(
                this.schema.message_format.content_types.image
            ));
        }
    }

    private buildHeaders(): void {
        this.headers.clear();

        // Process required headers
        if (this.schema.headers?.required) {
            for (const [key, value] of Object.entries(this.schema.headers.required)) {
                let headerValue = value;

                // Replace API key placeholder
                if (this.schema.authentication?.key_placeholder) {
                    const placeholder = this.schema.authentication.key_placeholder;
                    headerValue = headerValue.replace(new RegExp(placeholder, 'g'), this.apiKey);
                }

                this.headers.set(key, headerValue);
            }
        }

        // Process optional headers
        if (this.schema.headers?.optional) {
            for (const [key, value] of Object.entries(this.schema.headers.optional)) {
                if (value && typeof value === 'string' && value.length > 0) {
                    this.headers.set(key, value);
                }
            }
        }
    }

    private applyDefaults(): void {
        if (this.schema.models?.default) {
            this.modelName = this.schema.models.default;
        }
    }

    setModel(model: string): GeneralContext {
        // Validate model if available models are specified
        if (this.schema.models?.available) {
            const found = this.schema.models.available.includes(model);
            if (!found && this.config.enableValidation) {
                throw new ValidationException(`Model '${model}' is not supported by this provider`);
            }
        }

        this.modelName = model;
        return this;
    }

    setSystemMessage(systemText: string): GeneralContext {
        if (!this.supportsSystemMessages() && this.config.enableValidation) {
            throw new ValidationException(
                `Provider '${this.providerName}' does not support system messages`
            );
        }
        this.systemMessage = systemText;
        return this;
    }

    setParameter(key: string, value: any): GeneralContext {
        if (this.config.enableValidation) {
            this.validateParameter(key, value);
        }
        this.parameters.set(key, value);
        return this;
    }

    setParameters(params: Record<string, any>): GeneralContext {
        for (const [key, value] of Object.entries(params)) {
            this.setParameter(key, value);
        }
        return this;
    }

    setApiKey(apiKey: string): GeneralContext {
        if (!apiKey) {
            throw new ValidationException('API key cannot be empty');
        }
        this.apiKey = apiKey;
        this.buildHeaders(); // Rebuild headers with new API key
        return this;
    }

    addUserMessage(
        content: string,
        mediaType?: string,
        mediaData?: string
    ): GeneralContext {
        return this.addMessage('user', content, mediaType, mediaData);
    }

    addAssistantMessage(content: string): GeneralContext {
        return this.addMessage('assistant', content);
    }

    addMessage(
        role: string,
        content: string,
        mediaType?: string,
        mediaData?: string
    ): GeneralContext {
        const message = this.createMessage(role, content, mediaType, mediaData);
        if (this.config.enableValidation) {
            this.validateMessage(message);
        }
        this.messages.push(message);
        return this;
    }

    private createMessage(
        role: string,
        content: string,
        mediaType?: string,
        mediaData?: string
    ): any {
        const message = JSON.parse(JSON.stringify(this.messageStructure));
        message.role = role;

        // Handle different content formats
        if (this.schema.message_format.structure.content === '<TEXT_CONTENT>') {
            // Simple text format (like DeepSeek)
            message.content = content;
        } else {
            // Array format (like OpenAI/Claude)
            const contentArray = [];
            contentArray.push(this.createTextContent(content));

            // Add image if provided
            if (mediaType && mediaData) {
                if (!this.supportsMultimodal() && this.config.enableValidation) {
                    throw new ValidationException(
                        `Provider '${this.providerName}' does not support multimodal content`
                    );
                }
                contentArray.push(this.createImageContent(mediaType, mediaData));
            }

            message.content = contentArray;
        }

        return message;
    }

    private createTextContent(text: string): any {
        const content = JSON.parse(JSON.stringify(this.textContentFormat));
        content.text = text;
        return content;
    }

    private createImageContent(mediaType: string, data: string): any {
        const content = JSON.parse(JSON.stringify(this.imageContentFormat));

        // Handle different image formats
        if ('source' in content) {
            // Claude format
            content.source.media_type = mediaType;
            content.source.data = this.isBase64Encoded(data) ?
                data : this.encodeImageToBase64(data);
        } else if ('image_url' in content) {
            // OpenAI format
            const base64Data = this.isBase64Encoded(data) ?
                data : this.encodeImageToBase64(data);
            content.image_url.url = `data:${mediaType};base64,${base64Data}`;
        }

        return content;
    }

    buildRequest(streaming: boolean = false): any {
        const request = JSON.parse(JSON.stringify(this.requestTemplate));
        const messagesArray = [...this.messages];

        // Set model
        if (this.modelName) {
            request.model = this.modelName;
        }

        // Set system message if supported
        if (this.systemMessage && this.supportsSystemMessages()) {
            const systemInRoles = this.validRoles.has('system');

            if (systemInRoles) {
                // Insert system message at beginning
                messagesArray.unshift(this.createMessage('system', this.systemMessage));
            } else {
                // Claude style - use separate system field
                request.system = this.systemMessage;
            }
        }

        // Set messages
        request.messages = messagesArray;

        // Apply custom parameters FIRST (so they take precedence)
        for (const [key, value] of this.parameters) {
            request[key] = value;
        }

        // Apply config defaults only if not already set
        if (this.config.defaultMaxTokens && !('max_tokens' in request)) {
            request.max_tokens = this.config.defaultMaxTokens;
        }
        if (this.config.defaultTemperature && !('temperature' in request)) {
            request.temperature = this.config.defaultTemperature;
        }

        // Set streaming: user parameter takes precedence over function parameter
        if (!this.parameters.has('stream')) {
            // User hasn't explicitly set stream parameter
            if (streaming && this.schema.features?.streaming) {
                request.stream = true;
            } else {
                request.stream = false;
            }
        }

        // Remove null values recursively
        this.removeNullsRecursive(request);

        return request;
    }

    extractTextResponse(response: any): string {
        try {
            const textNode = this.resolvePath(response, this.textPath);
            return String(textNode);
        } catch (error) {
            throw new Error(`Failed to extract text response: ${error}`);
        }
    }

    extractFullResponse(response: any): any {
        try {
            const contentPath = this.schema.response_format.success.content_path;
            return this.resolvePath(response, contentPath);
        } catch (error) {
            throw new Error(`Failed to extract full response: ${error}`);
        }
    }

    extractError(response: any): string {
        if (this.errorPath.length === 0) {
            return 'Unknown error';
        }

        try {
            const errorNode = this.resolvePath(response, this.errorPath);
            return String(errorNode);
        } catch {
            return 'Failed to parse error message';
        }
    }

    private resolvePath(obj: any, path: (string | number)[]): any {
        let current = obj;

        for (const key of path) {
            if (typeof key === 'number' || /^\d+$/.test(String(key))) {
                // Array index
                const index = typeof key === 'number' ? key : parseInt(String(key), 10);
                if (!Array.isArray(current) || index >= current.length) {
                    throw new Error(`Invalid array access: index ${key}`);
                }
                current = current[index];
            } else {
                // Object key
                if (typeof current !== 'object' || !(key in current)) {
                    throw new Error(`Invalid object access: key ${key}`);
                }
                current = current[key];
            }
        }

        return current;
    }

    private removeNullsRecursive(obj: any): void {
        if (Array.isArray(obj)) {
            for (const item of obj) {
                this.removeNullsRecursive(item);
            }
        } else if (obj && typeof obj === 'object') {
            for (const key of Object.keys(obj)) {
                if (obj[key] === null) {
                    delete obj[key];
                } else {
                    this.removeNullsRecursive(obj[key]);
                }
            }
        }
    }

    private validateMessage(message: any): void {
        if (!('role' in message) || !('content' in message)) {
            throw new ValidationException("Message must contain 'role' and 'content' fields");
        }

        const role = message.role;
        if (this.validRoles.size > 0 && !this.validRoles.has(role)) {
            throw new ValidationException(`Invalid message role: ${role}`);
        }
    }

    private validateParameter(key: string, value: any): void {
        if (value === null || value === undefined) {
            throw new ValidationException(`Parameter '${key}' cannot be null`);
        }

        if (!this.schema.parameters || !(key in this.schema.parameters)) {
            return; // Parameter not defined in schema
        }

        const paramDef = this.schema.parameters[key];

        // String length validation
        if (typeof value === 'string' && paramDef.max_length) {
            if (value.length > paramDef.max_length) {
                throw new ValidationException(
                    `Parameter '${key}' exceeds maximum length of ${paramDef.max_length}`
                );
            }
        }

        // Enum validation
        if (paramDef.enum) {
            if (!paramDef.enum.includes(value)) {
                throw new ValidationException(`Parameter '${key}' has invalid value`);
            }
        }

        // Type validation
        if (paramDef.type) {
            const expectedType = paramDef.type;
            let isValid = false;

            switch (expectedType) {
                case 'integer':
                    isValid = Number.isInteger(value);
                    break;
                case 'float':
                case 'number':
                    isValid = typeof value === 'number';
                    break;
                case 'string':
                    isValid = typeof value === 'string';
                    break;
                case 'boolean':
                    isValid = typeof value === 'boolean';
                    break;
                case 'array':
                    isValid = Array.isArray(value);
                    break;
            }

            if (!isValid) {
                throw new ValidationException(`Parameter '${key}' must be a ${expectedType}`);
            }
        }

        // Range validation for numbers
        if (typeof value === 'number') {
            if (paramDef.min !== undefined && value < paramDef.min) {
                throw new ValidationException(
                    `Parameter '${key}' must be >= ${paramDef.min}`
                );
            }
            if (paramDef.max !== undefined && value > paramDef.max) {
                throw new ValidationException(
                    `Parameter '${key}' must be <= ${paramDef.max}`
                );
            }
        }
    }

    private encodeImageToBase64(imagePath: string): string {
        // In browser context, this would be handled differently
        // For now, throw an error - actual implementation would use FileReader API
        throw new Error('File path encoding not supported in browser. Please provide base64 data.');
    }

    private isBase64Encoded(data: string): boolean {
        if (!data) return false;

        // Check for data URI scheme
        if (data.startsWith('data:') && data.includes(';base64,')) {
            return true;
        }

        // Check for valid Base64 characters
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        const cleanData = data.replace(/\s/g, '');

        if (!base64Regex.test(cleanData)) {
            return false;
        }

        // Validate length (must be divisible by 4)
        return cleanData.length % 4 === 0;
    }

    // Reset methods
    reset(): void {
        this.clearUserMessages();
        this.clearSystemMessage();
        this.clearParameters();
        this.modelName = '';
        this.applyDefaults();
    }

    clearUserMessages(): void {
        this.messages = [];
    }

    clearSystemMessage(): void {
        this.systemMessage = undefined;
    }

    clearParameters(): void {
        this.parameters.clear();
    }

    // Getter methods
    hasApiKey(): boolean {
        return this.apiKey !== '';
    }

    getSchema(): Schema {
        return this.schema;
    }

    getProviderName(): string {
        return this.providerName;
    }

    getEndpoint(): string {
        return this.endpoint;
    }

    getHeaders(): Map<string, string> {
        return new Map(this.headers);
    }

    getSupportedModels(): string[] {
        return this.schema.models?.available || [];
    }

    supportsMultimodal(): boolean {
        return this.schema.multimodal?.supported || false;
    }

    supportsStreaming(): boolean {
        return this.schema.features?.streaming || false;
    }

    supportsSystemMessages(): boolean {
        return this.schema.system_message?.supported || false;
    }

    isValidRequest(): boolean {
        return this.getValidationErrors().length === 0;
    }

    getValidationErrors(): string[] {
        const errors: string[] = [];

        // Check required fields
        if (!this.modelName) {
            errors.push('Model name is required');
        }

        if (this.messages.length === 0) {
            errors.push('At least one message is required');
        }

        // Validate message roles
        if (this.schema.validation?.message_validation) {
            const validation = this.schema.validation.message_validation;

            if (validation.last_message_role && this.messages.length > 0) {
                const lastRole = this.messages[this.messages.length - 1].role;
                if (lastRole !== validation.last_message_role) {
                    errors.push(`Last message must be from: ${validation.last_message_role}`);
                }
            }
        }

        return errors;
    }

    getParameters(): Map<string, any> {
        return new Map(this.parameters);
    }

    getParameter(key: string): any {
        if (!this.parameters.has(key)) {
            throw new ValidationException(`Parameter '${key}' not found`);
        }
        return this.parameters.get(key);
    }

    getParameterAs<T>(key: string): T {
        const param = this.getParameter(key);
        return param as T;
    }

    getParameterAsWithDefault<T>(key: string, defaultValue: T): T {
        if (!this.hasParameter(key)) {
            return defaultValue;
        }
        return this.getParameterAs<T>(key);
    }

    hasParameter(key: string): boolean {
        return this.parameters.has(key);
    }

    getMessages(): any[] {
        return [...this.messages];
    }

    getCurrentModel(): string {
        return this.modelName;
    }

    // Export/Import for state persistence
    exportState(): any {
        return {
            modelName: this.modelName,
            systemMessage: this.systemMessage,
            messages: this.messages,
            parameters: Object.fromEntries(this.parameters),
            apiKey: this.apiKey // Be careful with this in production!
        };
    }

    importState(state: any): void {
        if (state.modelName) this.modelName = state.modelName;
        if (state.systemMessage) this.systemMessage = state.systemMessage;
        if (state.messages) this.messages = [...state.messages];
        if (state.parameters) {
            this.parameters = new Map(Object.entries(state.parameters));
        }
        if (state.apiKey) {
            this.apiKey = state.apiKey;
            this.buildHeaders();
        }
    }
}

// Helper function for browser-based base64 encoding
export async function encodeFileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // Remove the data URL prefix to get just the base64 string
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Utility function to create data URI
export function createDataURI(mimeType: string, base64Data: string): string {
    return `data:${mimeType};base64,${base64Data}`;
}
