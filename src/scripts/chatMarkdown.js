/**
 * Render LLM markdown to safe HTML for chat bubbles.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.use({
    gfm: true,
    breaks: true,
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

/**
 * @param {string} text - Raw markdown from the model
 * @returns {string} Sanitized HTML
 */
export function renderChatMarkdown(text) {
    if (text == null || text === '') return '';
    const raw = marked.parse(String(text), { async: false });
    return DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target'],
    });
}
