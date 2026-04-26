// LLM API Integration for Chat Interface
//
// `model` is synced from `GET /api/llm-meta` on first send. The server maps Gemini ids away when
// `LLM_PROVIDER=openai`; set `LLM_DEFAULT_MODEL` / `LLM_OPENAI_FALLBACK_MODEL` in `.env` for LiteLLM allowlists.

/** Matches the Entanglement custom model system prompt on the chat server when used standalone. */
const ENTANGLEMENT_SYSTEM_PROMPT =
    'You are an academic expert on topics related to climate change, decolonialism, and Black critical theory. Drawing on your expertise, respond thoughtfully to any questions about the data so that users can explore specific topics in greater depth. ' +
    'Treat **Climate Change**, **Decolonization**, and **Global Blackness** as three analytical lenses. In your **first** assistant reply of a conversation (when there is no prior assistant message in the thread), make those three perspectives **explicit** in the answer—not as empty labels, but as clearly connected parts of your response. In **follow-up** replies, bring those three perspectives in explicitly **only** when the user asks for them or clearly frames the question around one or more of them; otherwise answer directly without structuring around those three themes. ' +
    'At the very end of every response, after your main answer, add a short section titled **References** (or equivalent) listing **exactly two** bibliographical references: real, citable books or articles that are among the most relevant scholarly texts to the topic under discussion. Use full reference style (author, title, publisher or journal, year where known). ' +
    'If you are uncertain about a detail for a reference, prefer well-known foundational or widely cited works in the field rather than inventing citations.';

/** Injected by webpack (`''` in production → use page origin). */
function devBackendOrigin() {
    // eslint-disable-next-line no-undef -- replaced at compile time
    const v = __BACKEND_ORIGIN__;
    return typeof v === 'string' && v.length > 0 ? v : null;
}

function getLlmProxyUrl() {
    const backend = devBackendOrigin();
    if (backend) return `${backend}/proxy/llm`;
    if (typeof window === 'undefined') return 'http://127.0.0.1:3001/proxy/llm';
    const { origin, protocol } = window.location;
    if (protocol === 'file:' || !origin) return 'http://127.0.0.1:3001/proxy/llm';
    return `${origin}/proxy/llm`;
}

function getLlmMetaUrl() {
    const backend = devBackendOrigin();
    if (backend) return `${backend}/api/llm-meta`;
    if (typeof window === 'undefined') return 'http://127.0.0.1:3001/api/llm-meta';
    const { origin, protocol } = window.location;
    if (protocol === 'file:' || !origin) return 'http://127.0.0.1:3001/api/llm-meta';
    return `${origin}/api/llm-meta`;
}

export class LLMIntegration {
    constructor() {
        /** Resolved on each request so dev/prod URLs never go stale after HMR. */
        this._llmTransportLogged = false;
        /** Overwritten from `GET /api/llm-meta` before the first chat request. */
        this.model = 'gemini-2.5-flash';
        /** `'gemini' | 'openai-compatible' | null` after meta fetch. */
        this._llmProvider = null;
        this.conversationHistory = [];
        /** True after we attempt `/api/llm-meta` once (success or failure). */
        this._llmMetaLoadAttempted = false;
    }

    /** Align `this.model` with server `.env` (e.g. Gemini model id when `LLM_PROVIDER=gemini`). */
    async _syncModelFromServer() {
        if (this._llmMetaLoadAttempted) return;
        this._llmMetaLoadAttempted = true;
        try {
            const r = await fetch(getLlmMetaUrl(), { headers: { Accept: 'application/json' } });
            const ct = (r.headers.get('content-type') || '').toLowerCase();
            if (!r.ok) {
                console.warn('LLMIntegration: /api/llm-meta HTTP', r.status);
                return;
            }
            if (!ct.includes('application/json')) {
                console.warn(
                    'LLMIntegration: /api/llm-meta returned non-JSON (SPA catch-all or wrong server?). Content-Type:',
                    ct.slice(0, 80)
                );
                return;
            }
            const j = await r.json();
            if (j && typeof j.provider === 'string') {
                this._llmProvider = j.provider === 'gemini' ? 'gemini' : 'openai-compatible';
            }
            if (j && typeof j.defaultModel === 'string' && j.defaultModel.trim()) {
                this.model = j.defaultModel.trim();
            }
        } catch (e) {
            console.warn('LLMIntegration: /api/llm-meta failed', e);
        }
        const m = String(this.model || '').trim();
        const looksGemini = /gemini/i.test(m);
        if (!m) {
            this.model = this._llmProvider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o';
        } else if (this._llmProvider === 'openai-compatible' && looksGemini) {
            this.model = 'gpt-4o';
        }
    }

    /**
     * Generate initial question based on tag
     * @param {string} tag - The tag name to generate a question about
     * @returns {string} - Initial question about the tag
     */
    generateInitialQuestion(tag) {
        const questions = [
            `What can you tell me about "${tag}"?`,
            `I'm interested in learning more about "${tag}". Can you explain it?`,
            `Could you provide some insights about "${tag}"?`,
            `What should I know about "${tag}"?`,
            `Can you give me an overview of "${tag}"?`
        ];
        
        // Return a random question to make the conversation feel more natural
        return questions[Math.floor(Math.random() * questions.length)];
    }

    /**
     * Send a message to the LLM API
     * @param {string} message - The user's message
     * @param {boolean} isInitial - Whether this is the initial message
     * @returns {Promise<string>} - The LLM's response
     */
    async sendMessage(message, isInitial = false) {
        console.log('LLMIntegration: sendMessage called with:', { message, isInitial });

        if (!this._llmTransportLogged) {
            this._llmTransportLogged = true;
            console.info('[LLM transport]', {
                devBackendOrigin: devBackendOrigin(),
                metaUrl: getLlmMetaUrl(),
                proxyUrl: getLlmProxyUrl(),
                pageOrigin: typeof window !== 'undefined' ? window.location.origin : '(ssr)',
            });
        }

        await this._syncModelFromServer();

        try {
            // Add user message to conversation history
            this.conversationHistory.push({
                role: 'user',
                content: message
            });

            // Prepare the API request
            const requestData = {
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: ENTANGLEMENT_SYSTEM_PROMPT
                    },
                    ...this.conversationHistory
                ]
            };

            const proxyUrl = getLlmProxyUrl();
            console.log('LLMIntegration: Sending request to:', proxyUrl);
            console.log('LLMIntegration: Request data:', requestData);

            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: requestData.messages
                })
            });

            console.log('LLMIntegration: Response status:', response.status);
            console.log('LLMIntegration: Response headers:', Object.fromEntries(response.headers.entries()));

            if (!response.ok) {
                const errorText = await response.text();
                let detail = errorText.slice(0, 800);
                try {
                    const ej = JSON.parse(errorText);
                    detail = (ej.details || ej.error || detail).toString().slice(0, 800);
                } catch (_) {
                    /* plain text body */
                }
                console.error('LLMIntegration: API error response:', errorText);
                throw new Error(`API request failed with status: ${response.status} - ${detail}`);
            }

            const data = await response.json();
            console.log('LLMIntegration: Response data:', data);

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.error('LLMIntegration: Invalid response format:', data);
                throw new Error('Invalid response format from API');
            }

            const assistantMessage = data.choices[0].message.content;
            if (assistantMessage == null || assistantMessage === '') {
                console.error('LLMIntegration: Empty assistant content:', data);
                throw new Error('Empty assistant message from API');
            }
            console.log('LLMIntegration: Assistant message:', assistantMessage);
            
            // Add assistant response to conversation history
            this.conversationHistory.push({
                role: 'assistant',
                content: assistantMessage
            });

            return assistantMessage;

        } catch (error) {
            console.error('LLMIntegration: Error sending message to LLM:', error);
            console.error('LLMIntegration: Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });

            const msg = (error && error.message) || String(error);
            const network =
                /Failed to fetch|NetworkError|Load failed|ECONNREFUSED/i.test(msg) ||
                (typeof navigator !== 'undefined' && !navigator.onLine);
            const hint = network
                ? 'Could not reach the API server. If you use `yarn start`, keep both Node (port 3001) and webpack running; or open the app from the same `node server.js` that serves `dist/`.'
                : msg.replace(/^API request failed with status: \d+ - /, '').slice(0, 220);

            if (isInitial) {
                return `The assistant could not load a reply right now. ${hint}`;
            }
            return `Something went wrong. ${hint}`;
        }
    }

    /**
     * Get the initial message for a tag
     * @param {string} tag - The tag name
     * @returns {Promise<string>} - The initial response about the tag
     */
    async getInitialResponse(tag) {
        console.log('LLMIntegration: getInitialResponse called with tag:', tag);
        const initialQuestion = this.generateInitialQuestion(tag);
        console.log('LLMIntegration: Generated initial question:', initialQuestion);
        const response = await this.sendMessage(initialQuestion, true);
        console.log('LLMIntegration: Initial response received:', response);
        return response;
    }

    /**
     * Reset the conversation history
     */
    resetConversation() {
        this.conversationHistory = [];
    }

    /**
     * Get the current conversation history
     * @returns {Array} - The conversation history
     */
    getConversationHistory() {
        return [...this.conversationHistory];
    }

    /**
     * Set a new model
     * @param {string} model - The model name to use
     */
    setModel(model) {
        this.model = model;
    }

    /**
     * Check if the API is available
     * @returns {Promise<boolean>} - Whether the API is accessible
     */
    async checkApiHealth() {
        try {
            const testMessage = 'Hello';
            const response = await this.sendMessage(testMessage);
            return response && response.length > 0;
        } catch (error) {
            console.error('API health check failed:', error);
            return false;
        }
    }

    /**
     * Try different models to find one that works
     * @returns {Promise<string|null>} - The working model name or null
     */
    /**
     * Try common Gemini model ids against this app’s `/proxy/llm` (no API keys in the browser).
     * @returns {Promise<string|null>}
     */
    async findWorkingModel() {
        const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'];
        for (const model of models) {
            try {
                console.log(`LLMIntegration: Testing model: ${model}`);
                const originalModel = this.model;
                this.model = model;
                const response = await fetch(getLlmProxyUrl(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: 'Hello' }],
                    }),
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.choices?.[0]?.message?.content != null) {
                        console.log(`LLMIntegration: Model ${model} works!`);
                        return model;
                    }
                }
                this.model = originalModel;
            } catch (error) {
                console.log(`LLMIntegration: Model ${model} failed:`, error.message);
                this.model = this.model;
            }
        }
        console.error('LLMIntegration: No working Gemini model found via proxy');
        return null;
    }
}
