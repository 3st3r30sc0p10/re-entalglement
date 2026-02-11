// LLM API Integration for Chat Interface
export class LLMIntegration {
    constructor() {
        this.apiUrl = 'http://localhost:3001/proxy/llm'; // Use local proxy to avoid CORS issues
        this.apiKey = 'sk-dwAYbKw4KalzudSkQVcOWg'; // Not needed for proxy but kept for reference
        this.model = 'GPT 4.1'; // Using GPT 4.1 which is available on Duke's LiteLLM
        this.conversationHistory = [];
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
                        content: 'You are a helpful assistant that provides informative and engaging responses. Be conversational, helpful, and provide detailed explanations when appropriate. Keep responses concise but informative.'
                    },
                    ...this.conversationHistory
                ]
            };

            console.log('LLMIntegration: Sending request to:', this.apiUrl);
            console.log('LLMIntegration: Request data:', requestData);

            const response = await fetch(this.apiUrl, {
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
                console.error('LLMIntegration: API error response:', errorText);
                throw new Error(`API request failed with status: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('LLMIntegration: Response data:', data);
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.error('LLMIntegration: Invalid response format:', data);
                throw new Error('Invalid response format from API');
            }

            const assistantMessage = data.choices[0].message.content;
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
            
            // Return a fallback response
            if (isInitial) {
                return `I'd be happy to help you learn about "${message}". However, I'm having trouble connecting to the AI service right now. Please try again in a moment.`;
            } else {
                return 'I apologize, but I\'m having trouble processing your request right now. Please try again.';
            }
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
    async findWorkingModel() {
        const models = ['GPT 4.1', 'GPT 4.1 Mini', 'GPT 4.1 Nano', 'gpt-5', 'gpt-5-chat'];
        
        for (const model of models) {
            try {
                console.log(`LLMIntegration: Testing model: ${model}`);
                const originalModel = this.model;
                this.model = model;
                
                const response = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            {
                                role: 'user',
                                content: 'Hello'
                            }
                        ]
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        console.log(`LLMIntegration: Model ${model} works!`);
                        return model;
                    }
                }
                
                this.model = originalModel;
            } catch (error) {
                console.log(`LLMIntegration: Model ${model} failed:`, error.message);
                this.model = this.model; // Reset to original
            }
        }
        
        console.error('LLMIntegration: No working model found');
        return null;
    }
}
