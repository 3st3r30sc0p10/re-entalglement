/**
 * Full-area loading overlay with the shared CSS {@link .loader} (concentric rings).
 * Used for image API retrieval, chat LLM waits, and any other bottom-panel loads.
 */

/**
 * @param {HTMLElement} parent - Container (position: relative) to append the overlay to.
 * @param {{ title?: string; subtext?: string; sources?: Array<{ name: string; url?: string }> }} [copy]
 * @returns {{ root: HTMLElement; start: () => void; stop: () => void; setProgress: (p: number) => void; setText: (t: string) => void; setSubtext: (t: string) => void }}
 */
export function createBottomLoadingOverlay(parent, copy = {}) {
    if (!parent) {
        throw new Error('createBottomLoadingOverlay: parent element is required');
    }

    const title = copy.title ?? 'Loading...';
    const subtext = copy.subtext ?? '';
    const sources = Array.isArray(copy.sources) ? copy.sources : [];

    const sourcesBlock =
        sources.length > 0
            ? `<div class="bottom-loading-sources" data-role="sources">${sources
                  .map((s) => {
                      const name = escapeHtml(s.name || '');
                      const url = (s.url || '').trim();
                      if (!url) {
                          return `<div class="bottom-loading-source-row"><span class="bottom-loading-source-name">${name}</span></div>`;
                      }
                      return `<div class="bottom-loading-source-row"><span class="bottom-loading-source-name">${name}</span><a class="bottom-loading-source-link" href="${escapeAttr(
                          url
                      )}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></div>`;
                  })
                  .join('')}</div>`
            : '';

    const overlay = document.createElement('div');
    overlay.className = 'bottom-loading-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = `
            <div class="bottom-loading-content">
                ${sourcesBlock}
                <div class="bottom-loading-visual">
                    <div class="loader" aria-hidden="true"></div>
                </div>
                <div class="bottom-loading-copy">
                    <div class="bottom-loading-text" data-role="text"></div>
                    <div class="bottom-loading-subtext" data-role="subtext"></div>
                </div>
            </div>
        `;
    parent.appendChild(overlay);

    const textEl = overlay.querySelector('[data-role="text"]');
    const subEl = overlay.querySelector('[data-role="subtext"]');
    if (textEl) textEl.textContent = title;
    if (subEl) subEl.textContent = subtext;

    const start = () => {};
    const stop = () => {};
    const setProgress = () => {};
    const setText = (txt) => {
        const el = overlay.querySelector('[data-role="text"]');
        if (el) el.textContent = txt;
    };
    const setSubtext = (txt) => {
        const el = overlay.querySelector('[data-role="subtext"]');
        if (el) el.textContent = txt || '';
    };

    return { root: overlay, start, stop, setProgress, setText, setSubtext };
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
