// Chat Interface for Tag-based Conversations
import { LLMIntegration } from './LLMIntegration.js';
import { renderChatMarkdown } from './chatMarkdown.js';
import { TouchKeyboard } from './TouchKeyboard.js';
import { shouldPreferOnScreenKeyboard } from './touchKeyboardEnv.js';
import { createBottomLoadingOverlay } from './bottomLoadingOverlay.js';

export class ChatInterface {
    constructor() {
        this.llmIntegration = new LLMIntegration();
        this.chatModal = null;
        this.chatMessages = null;
        this.chatInput = null;
        this.chatSendBtn = null;
        this.chatStatus = null;
        this.chatCloseBtn = null;
        this.touchKeyboardHost = null;
        this.touchKeyboard = null;
        this.chatContainer = null;
        /** Same CSS ring loader as image API retrieval ({@link createBottomLoadingOverlay}). */
        this.chatLoader = null;
        this._touchScrollIsolationBound = false;
        this.currentTag = null;
        this.isLoading = false;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        this.chatModal = document.getElementById('chat-overlay-modal');
        this.chatContainer = this.chatModal?.querySelector('.chat-container') ?? null;
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.chatSendBtn = document.getElementById('chat-send');
        this.chatStatus = document.getElementById('chat-status');
        this.chatCloseBtn = document.getElementById('chat-close');
        this.touchKeyboardHost = document.getElementById('chat-touch-keyboard-host');
        
        // Debug: Check if elements were found
        console.log('ChatInterface: Elements found:', {
            chatModal: !!this.chatModal,
            chatMessages: !!this.chatMessages,
            chatInput: !!this.chatInput,
            chatSendBtn: !!this.chatSendBtn,
            chatStatus: !!this.chatStatus,
            chatCloseBtn: !!this.chatCloseBtn
        });
        this.setupTouchScrollIsolation();
    }

    /** Keep touch scroll inside chat panes (no preventDefault, passive listeners). */
    setupTouchScrollIsolation() {
        if (this._touchScrollIsolationBound || !this.chatModal) return;
        const isolate = (event) => {
            event.stopPropagation();
        };
        const selectors = ['.chat-container', '.chat-messages', '.chat-input-area', '#chat-touch-keyboard-host'];
        selectors.forEach((selector) => {
            const el = this.chatModal.querySelector(selector);
            if (!el) return;
            el.addEventListener('touchstart', isolate, { passive: true });
            el.addEventListener('touchmove', isolate, { passive: true });
        });
        this._touchScrollIsolationBound = true;
    }

    /**
     * True when we should block the system soft keyboard and rely on the on-screen keyboard
     * (kiosk / touch / coarse pointer).
     */
    useTouchKeyboard() {
        return shouldPreferOnScreenKeyboard();
    }

    teardownTouchKeyboard() {
        if (this.touchKeyboard) {
            this.touchKeyboard.unmount();
            this.touchKeyboard = null;
        }
        if (this.touchKeyboardHost) {
            this.touchKeyboardHost.hidden = true;
            this.touchKeyboardHost.setAttribute('aria-hidden', 'true');
        }
        if (this.chatInput) {
            this.chatInput.readOnly = false;
            this.chatInput.removeAttribute('inputmode');
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Close button
        if (this.chatCloseBtn) {
            this.chatCloseBtn.addEventListener('click', () => this.closeChat());
        }

        // Overlay click to close
        if (this.chatModal) {
            this.chatModal.addEventListener('click', (e) => {
                if (e.target === this.chatModal || e.target.classList.contains('chat-overlay')) {
                    this.closeChat();
                }
            });
        }

        // Send button
        if (this.chatSendBtn) {
            this.chatSendBtn.addEventListener('click', () => this.sendMessage());
        }

        // Enter key to send message
        if (this.chatInput) {
            this.chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            // Auto-resize textarea
            this.chatInput.addEventListener('input', () => this.autoResizeTextarea());
        }

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.closeChat();
            }
        });
    }

    /**
     * Open chat interface for a specific tag
     * @param {string} tag - The tag name to chat about
     */
    async openChat(tag) {
        console.log('ChatInterface: openChat called with tag:', tag);
        
        if (!this.chatModal) {
            console.error('Chat modal not found');
            return;
        }

        this.currentTag = tag;
        this.llmIntegration.resetConversation();
        
        // Update the title
        const tagNameElement = document.getElementById('chat-tag-name');
        if (tagNameElement) {
            tagNameElement.textContent = tag;
        }

        // Clear previous messages
        this.clearMessages();

        // Show the modal
        console.log('ChatInterface: Showing modal');
        this.chatModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        this.teardownTouchKeyboard();
        const preferOnScreenKb = this.useTouchKeyboard();
        if (this.chatInput && this.touchKeyboardHost) {
            this.touchKeyboardHost.hidden = false;
            this.touchKeyboardHost.setAttribute('aria-hidden', 'false');
            this.touchKeyboard = new TouchKeyboard(this.touchKeyboardHost, this.chatInput);
            this.touchKeyboard.mount();
            this.touchKeyboard.setDisabled(this.isLoading);
            if (preferOnScreenKb) {
                this.chatInput.readOnly = true;
                this.chatInput.setAttribute('inputmode', 'none');
                this.chatInput.setAttribute('autocomplete', 'off');
            } else {
                this.chatInput.readOnly = false;
                this.chatInput.removeAttribute('inputmode');
            }
            this.chatInput.focus({ preventScroll: true });
        } else if (this.chatInput) {
            this.chatInput.readOnly = false;
            this.chatInput.removeAttribute('inputmode');
            this.chatInput.focus();
        }

        // Get initial response
        await this.getInitialResponse();
    }

    /**
     * Close the chat interface
     */
    closeChat() {
        this.teardownTouchKeyboard();
        this._hideChatLoader();
        if (this.chatModal) {
            this.chatModal.style.display = 'none';
            document.body.style.overflow = '';
        }
        
        this.currentTag = null;
        this.llmIntegration.resetConversation();
        this.clearMessages();
    }

    /**
     * Check if chat is currently open
     * @returns {boolean}
     */
    isOpen() {
        return this.chatModal && this.chatModal.style.display === 'flex';
    }

    /**
     * Get initial response from LLM
     */
    async getInitialResponse() {
        console.log('ChatInterface: getInitialResponse called');
        if (!this.currentTag) {
            console.error('ChatInterface: No current tag set');
            return;
        }

        console.log('ChatInterface: Getting initial response for tag:', this.currentTag);
        this.setLoading(true, {
            title: 'Assistant is responding…',
            subtext: 'This may take a few seconds',
        });
        this.updateStatus('Getting initial response...');

        try {
            console.log('ChatInterface: Calling LLM integration...');
            const response = await this.llmIntegration.getInitialResponse(this.currentTag);
            console.log('ChatInterface: Received response from LLM:', response);
            this.addBotMessage(response);
            this.updateStatus('');
        } catch (error) {
            console.error('ChatInterface: Error getting initial response:', error);
            this.addBotMessage('I apologize, but I\'m having trouble connecting right now. Please try again.');
            this.updateStatus('Connection error. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Send a user message
     */
    async sendMessage() {
        if (!this.chatInput || this.isLoading) return;

        const message = this.chatInput.value.trim();
        if (!message) return;

        // Add user message to chat
        this.addUserMessage(message);
        
        // Clear input
        this.chatInput.value = '';
        this.autoResizeTextarea();

        // Set loading state (same CSS ring loader as image retrieval)
        this.setLoading(true, {
            title: 'Assistant is thinking…',
            subtext: 'This may take a few seconds',
        });
        this.updateStatus('Thinking...');

        try {
            const response = await this.llmIntegration.sendMessage(message);
            this.addBotMessage(response);
            this.updateStatus('');
        } catch (error) {
            console.error('Error sending message:', error);
            this.addBotMessage('I apologize, but I\'m having trouble processing your message right now. Please try again.');
            this.updateStatus('Error sending message. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Add a user message to the chat
     * @param {string} message - The message text
     */
    addUserMessage(message) {
        this.removeInitialPlaceholderMessage();
        const messageElement = this.createMessageElement(message, 'user');
        this.chatMessages.appendChild(messageElement);
        this.scrollToBottom();
    }

    /** Remove the static "Loading..." stub so real messages don't stack under it */
    removeInitialPlaceholderMessage() {
        const initial = this.chatMessages?.querySelector('#initial-message');
        const row = initial?.closest('.chat-message');
        if (row) row.remove();
    }

    /**
     * Add a bot message to the chat
     * @param {string} message - The message text
     */
    addBotMessage(message) {
        this.removeInitialPlaceholderMessage();
        const messageElement = this.createMessageElement(message, 'bot');
        this.chatMessages.appendChild(messageElement);
        this.scrollToBottom();
    }

    /**
     * Create a message element
     * @param {string} text - The message text
     * @param {string} type - 'user' or 'bot'
     * @returns {HTMLElement} - The message element
     */
    createMessageElement(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}-message`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = type === 'user' ? '👤' : '🤖';

        const content = document.createElement('div');
        content.className = 'message-content';

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        if (type === 'bot') {
            textDiv.classList.add('message-text--markdown');
            textDiv.innerHTML = renderChatMarkdown(text);
        } else {
            textDiv.textContent = text;
        }

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        content.appendChild(textDiv);
        content.appendChild(timeDiv);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        return messageDiv;
    }

    /**
     * Clear all messages from the chat
     */
    clearMessages() {
        if (this.chatMessages) {
            // Keep only the initial loading message
            const initialMessage = this.chatMessages.querySelector('#initial-message');
            if (initialMessage) {
                this.chatMessages.innerHTML = `
                    <div class="chat-message bot-message">
                        <div class="message-avatar">🤖</div>
                        <div class="message-content">
                            <div class="message-text" id="initial-message">Loading...</div>
                            <div class="message-time" id="initial-time"></div>
                        </div>
                    </div>
                `;
            } else {
                this.chatMessages.innerHTML = '';
            }
        }
    }

    /**
     * Set loading state
     * @param {boolean} loading - Whether to show loading state
     * @param {{ title?: string; subtext?: string }} [copy] - Overlay copy when showing the canvas loader
     */
    setLoading(loading, copy = {}) {
        this.isLoading = loading;

        if (loading) {
            this._showChatLoader(copy);
        } else {
            this._hideChatLoader();
        }
        
        if (this.chatSendBtn) {
            this.chatSendBtn.disabled = loading;
        }

        if (this.chatInput) {
            this.chatInput.disabled = loading;
        }
        this.touchKeyboard?.setDisabled(loading);
    }

    _showChatLoader(copy = {}) {
        this._hideChatLoader();
        if (!this.chatContainer) return;
        try {
            this.chatLoader = createBottomLoadingOverlay(this.chatContainer, {
                title: copy.title || 'Assistant is thinking…',
                subtext: copy.subtext ?? 'This may take a few seconds',
            });
            this.chatLoader.root.classList.add('visible');
            this.chatLoader.start();
        } catch (e) {
            console.warn('ChatInterface: could not mount chat loader', e);
            this.chatLoader = null;
        }
    }

    _hideChatLoader() {
        if (this.chatLoader) {
            try {
                this.chatLoader.stop();
                this.chatLoader.root.remove();
            } catch {
                /* ignore */
            }
            this.chatLoader = null;
        }
    }

    /**
     * Update status message
     * @param {string} message - Status message
     */
    updateStatus(message) {
        if (this.chatStatus) {
            this.chatStatus.textContent = message;
            this.chatStatus.className = message ? 'chat-status typing' : 'chat-status';
        }
    }

    /**
     * Auto-resize textarea based on content
     */
    autoResizeTextarea() {
        if (!this.chatInput) return;

        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 120) + 'px';
    }

    /**
     * Scroll chat to bottom
     */
    scrollToBottom() {
        if (this.chatMessages) {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
    }

    /**
     * Setup tag click handlers for the tags container
     * @param {HTMLElement} tagsContainer - The tags container element
     */
    setupTagClickHandlers(tagsContainer) {
        console.log('ChatInterface: Setting up tag click handlers for:', tagsContainer);
        
        if (!tagsContainer) {
            console.error('ChatInterface: No tags container provided');
            return;
        }

        // Use event delegation for dynamic tags
        tagsContainer.addEventListener('click', (e) => {
            console.log('ChatInterface: Tag container clicked:', e.target);
            console.log('ChatInterface: Click event details:', {
                target: e.target,
                targetClass: e.target.className,
                targetTag: e.target.tagName,
                currentTarget: e.currentTarget
            });
            const tagElement = e.target.closest('.tag');
            if (tagElement) {
                const tagName = tagElement.getAttribute('data-tag') || tagElement.textContent.trim();
                console.log('ChatInterface: Tag clicked:', tagName);
                console.log('ChatInterface: Tag element:', tagElement);
                if (tagName) {
                    this.openChat(tagName);
                }
            } else {
                console.log('ChatInterface: No .tag element found in click target');
            }
        });
        
        console.log('ChatInterface: Tag click handlers set up successfully');
    }

    /**
     * Setup tail click handlers for the tail categories container
     * @param {HTMLElement} tailContainer - The tail categories container element
     */
    setupTailClickHandlers(tailContainer) {
        console.log('ChatInterface: Setting up tail click handlers for:', tailContainer);

        if (!tailContainer) {
            console.error('ChatInterface: No tail container provided');
            return;
        }

        // Use event delegation for dynamic tail categories
        tailContainer.addEventListener('click', (e) => {
            const tailElement = e.target.closest('.tail-category');
            if (tailElement) {
                const tailLabel = tailElement.getAttribute('data-tail') || tailElement.textContent.trim();
                console.log('ChatInterface: Tail category clicked:', tailLabel);
                if (tailLabel) {
                    this.openChat(tailLabel);
                }
            }
        });

        console.log('ChatInterface: Tail click handlers set up successfully');
    }
}
