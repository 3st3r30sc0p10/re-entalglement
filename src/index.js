import './styles/main.css';
import { NetworkGraph } from './scripts/NetworkGraph';
import { DataProcessor } from './scripts/DataProcessor';
import { ImageRepositories } from './scripts/ImageAPIs';
import { ChatInterface } from './scripts/ChatInterface';
import { resetWelcomePageTransition, runWelcomePageTransition } from './scripts/welcomePageTransition';
import { initKioskMode } from './scripts/kioskMode';
import { TouchKeyboard } from './scripts/TouchKeyboard';
import { shouldPreferOnScreenKeyboard } from './scripts/touchKeyboardEnv';

function escapeHtml(text) {
    if (text == null) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

function formatPlainDescription(text) {
    return escapeHtml(String(text)).replace(/\n/g, '<br/>');
}

class App {
    constructor() {
        this.networkGraph = new NetworkGraph('network-graph', {
            nodeRadius: 8,
            linkDistance: 100
        });
        this.dataRefreshInterval = 60000; // 1 minute
        this.dataRefreshTimer = null;
        this.map = null;
        this.isInteracting = false;
        this.imageRepositories = new ImageRepositories();
        this.chatInterface = null; // Will be initialized after DOM is ready
        this._openSlidePanelId = null;
        this._tagsRailHintHideTimer = null;

        this.initializeEventListeners();
        this.tagTailsRelations = this.buildTagTailsRelations();
        this.setupBottomPanel();
        this.setupTagsPanel();
        this.setupIconRail();
        this.setupAboutOverlay();
        this.feedbackTouchKeyboard = null;
        this.feedbackTouchKeyboardHost = null;
        this.setupFeedbackOverlay();
        this.setupSlidePanels();
    }

    /** Tag list element (bottom / tags slide); graph sync uses this, not the unused right tags panel. */
    _getTagsListEl() {
        return this.bottomTagsList || this.tagsContainer;
    }

    /** Show left icon rail after a graph node interaction (video, tag, or tail). */
    showLateralPanels() {
        document.querySelector('.graph-container')?.classList.add('graph-container--has-selection');
        this.iconRail = this.iconRail || document.querySelector('.icon-rail');
        if (this.iconRail) {
            this.iconRail.classList.remove('hidden');
            this.iconRail.setAttribute('aria-hidden', 'false');
        }
        if (this.networkGraph && typeof this.networkGraph.handleResize === 'function') {
            requestAnimationFrame(() => this.networkGraph.handleResize());
        }
    }

    /** Guided demo: full graph + icon rail; does not open slide panels or chat. */
    prepareInterfaceTour() {
        document.body.classList.add('interface-demo-tour-active');
        document.querySelector('.icon-rail')?.classList.add('icon-rail--demo-tour');
        try {
            this.networkGraph?.beginInterfaceTourGraphState?.();
        } catch (e) {
            console.warn('prepareInterfaceTour:', e);
        }
        this.showLateralPanels();
        requestAnimationFrame(() => {
            try {
                this.networkGraph?.handleResize?.();
            } catch {
                /* ignore */
            }
        });
    }

    /** After the tour: restore baseline graph and hide the rail until the user selects a node again. */
    cleanupInterfaceTour() {
        document.body.classList.remove('interface-demo-tour-active');
        try {
            this.networkGraph?.endInterfaceTourGraphState?.();
        } catch (e) {
            console.warn('cleanupInterfaceTour:', e);
        }
        document.querySelector('.icon-rail')?.classList.remove('icon-rail--demo-tour');
        this.hideLateralPanels();
    }

    /** Hide icon rail and overlays when the graph returns to the default view. */
    hideLateralPanels() {
        document.querySelector('.graph-container')?.classList.remove('graph-container--has-selection');
        this.iconRail = this.iconRail || document.querySelector('.icon-rail');
        if (this.iconRail) {
            this.iconRail.classList.add('hidden');
            this.iconRail.setAttribute('aria-hidden', 'true');
        }
        this.closeFullscreenVideo();
        this.closeAboutFullscreen();
        this.closeFeedbackFullscreen();
        this._hideTagsRailContextHintImmediate();
        this._hideTailsRailContextHintImmediate();
        this.closeAllSlidePanels();
        this._setActiveRailButton(null);
        if (this.networkGraph && typeof this.networkGraph.handleResize === 'function') {
            requestAnimationFrame(() => this.networkGraph.handleResize());
        }
    }

    _refreshBodyOverflowForOverlays() {
        const videoOpen = this.fullscreenVideoOverlay && !this.fullscreenVideoOverlay.hidden;
        const aboutOpen = this.aboutOverlay && !this.aboutOverlay.hidden;
        const feedbackOpen = this.feedbackOverlay && !this.feedbackOverlay.hidden;
        if (!videoOpen && !aboutOpen && !feedbackOpen) {
            document.body.style.overflow = '';
        }
    }

    setupAboutOverlay() {
        this.aboutOverlay = document.getElementById('about-fullscreen-overlay');
        if (!this.aboutOverlay) return;

        const close = () => {
            this.closeAboutFullscreen();
            this._setActiveRailButton(null);
        };

        document.getElementById('about-fullscreen-close')?.addEventListener('click', close);
        this.aboutOverlay.querySelector('.about-fullscreen-backdrop')?.addEventListener('click', close);
    }

    teardownFeedbackTouchKeyboard() {
        if (this.feedbackTouchKeyboard) {
            this.feedbackTouchKeyboard.unmount();
            this.feedbackTouchKeyboard = null;
        }
        if (this.feedbackTouchKeyboardHost) {
            this.feedbackTouchKeyboardHost.hidden = true;
            this.feedbackTouchKeyboardHost.setAttribute('aria-hidden', 'true');
        }
        const ta = document.getElementById('feedback-fullscreen-text');
        if (ta) {
            ta.readOnly = false;
            ta.removeAttribute('inputmode');
        }
    }

    mountFeedbackTouchKeyboard() {
        const textarea = document.getElementById('feedback-fullscreen-text');
        this.feedbackTouchKeyboardHost =
            this.feedbackTouchKeyboardHost || document.getElementById('feedback-touch-keyboard-host');
        this.teardownFeedbackTouchKeyboard();
        if (!textarea || !this.feedbackTouchKeyboardHost) return;
        const preferOnScreenKb = shouldPreferOnScreenKeyboard();
        this.feedbackTouchKeyboardHost.hidden = false;
        this.feedbackTouchKeyboardHost.setAttribute('aria-hidden', 'false');
        this.feedbackTouchKeyboard = new TouchKeyboard(this.feedbackTouchKeyboardHost, textarea);
        this.feedbackTouchKeyboard.mount();
        if (preferOnScreenKb) {
            textarea.readOnly = true;
            textarea.setAttribute('inputmode', 'none');
            textarea.setAttribute('autocomplete', 'off');
        } else {
            textarea.readOnly = false;
            textarea.removeAttribute('inputmode');
        }
    }

    setupFeedbackOverlay() {
        this.feedbackOverlay = document.getElementById('feedback-fullscreen-overlay');
        if (!this.feedbackOverlay) return;

        const close = () => {
            this.closeFeedbackFullscreen();
            this._setActiveRailButton(null);
        };

        document.getElementById('feedback-fullscreen-close')?.addEventListener('click', close);
        this.feedbackOverlay.querySelector('.feedback-fullscreen-backdrop')?.addEventListener('click', close);

        const form = document.getElementById('feedback-fullscreen-form');
        const statusEl = document.getElementById('feedback-fullscreen-status');
        const textarea = document.getElementById('feedback-fullscreen-text');
        const submitBtn = document.getElementById('feedback-fullscreen-submit');

        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = textarea?.value?.trim() || '';
            if (msg.length < 1) {
                if (statusEl) statusEl.textContent = 'Please enter a comment before sending.';
                return;
            }
            if (statusEl) statusEl.textContent = '';
            if (submitBtn) submitBtn.disabled = true;
            this.feedbackTouchKeyboard?.setDisabled(true);
            try {
                const res = await fetch('/api/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.ok) {
                    throw new Error(data.error || 'Send failed');
                }
                if (statusEl) statusEl.textContent = 'Thank you — your feedback was received.';
                if (textarea) textarea.value = '';
            } catch {
                if (statusEl) {
                    statusEl.textContent = 'Could not send. Please try again in a moment.';
                }
            } finally {
                if (submitBtn) submitBtn.disabled = false;
                this.feedbackTouchKeyboard?.setDisabled(false);
            }
        });
    }

    openAboutFullscreen() {
        if (!this.aboutOverlay) return;
        this.closeFeedbackFullscreen();
        this.closeFullscreenVideo();
        this.closeAllSlidePanels();
        this.aboutOverlay.hidden = false;
        this.aboutOverlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
            document.getElementById('about-fullscreen-close')?.focus();
        });
    }

    closeAboutFullscreen() {
        if (!this.aboutOverlay || this.aboutOverlay.hidden) return;
        this.aboutOverlay.hidden = true;
        this.aboutOverlay.setAttribute('aria-hidden', 'true');
        this._refreshBodyOverflowForOverlays();
    }

    openFeedbackFullscreen() {
        if (!this.feedbackOverlay) return;
        this.closeAboutFullscreen();
        this.closeFullscreenVideo();
        this.closeAllSlidePanels();
        const statusEl = document.getElementById('feedback-fullscreen-status');
        if (statusEl) statusEl.textContent = '';
        this.feedbackOverlay.hidden = false;
        this.feedbackOverlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        this.mountFeedbackTouchKeyboard();
        requestAnimationFrame(() => {
            document.getElementById('feedback-fullscreen-text')?.focus({ preventScroll: true });
        });
    }

    closeFeedbackFullscreen() {
        if (!this.feedbackOverlay || this.feedbackOverlay.hidden) return;
        this.teardownFeedbackTouchKeyboard();
        this.feedbackOverlay.hidden = true;
        this.feedbackOverlay.setAttribute('aria-hidden', 'true');
        this._refreshBodyOverflowForOverlays();
    }

    setupIconRail() {
        this.iconRail = document.querySelector('.icon-rail');
        this.fullscreenVideoOverlay = document.getElementById('fullscreen-video-overlay');
        if (!this.iconRail) return;

        this.iconRail.querySelectorAll('.icon-rail-btn[data-open]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const which = btn.getAttribute('data-open');
                if (which === 'about') {
                    if (this.aboutOverlay && !this.aboutOverlay.hidden) {
                        this.closeAboutFullscreen();
                        this._setActiveRailButton(null);
                    } else {
                        this.closeFeedbackFullscreen();
                        this.closeAllSlidePanels();
                        this.closeFullscreenVideo();
                        this.openAboutFullscreen();
                        this._setActiveRailButton(btn);
                    }
                    return;
                }
                if (which === 'feedback') {
                    if (this.feedbackOverlay && !this.feedbackOverlay.hidden) {
                        this.closeFeedbackFullscreen();
                        this._setActiveRailButton(null);
                    } else {
                        this.closeAllSlidePanels();
                        this.closeFullscreenVideo();
                        this.openFeedbackFullscreen();
                        this._setActiveRailButton(btn);
                    }
                    return;
                }
                this.closeAboutFullscreen();
                this.closeFeedbackFullscreen();
                if (which === 'video') {
                    this.closeAllSlidePanels();
                    this.toggleFullscreenVideo();
                    this._setActiveRailButton(this.fullscreenVideoOverlay && !this.fullscreenVideoOverlay.hidden ? btn : null);
                    return;
                }
                this.closeFullscreenVideo();
                if (this._openSlidePanelId === which) {
                    this.closeSlidePanel(which);
                    this._setActiveRailButton(null);
                } else {
                    this.openSlidePanel(which);
                    this._setActiveRailButton(btn);
                }
            });
        });

        const fsClose = document.querySelector('.fullscreen-video-close');
        if (fsClose) {
            fsClose.addEventListener('click', () => {
                this.closeFullscreenVideo();
                this._setActiveRailButton(null);
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (this.aboutOverlay && !this.aboutOverlay.hidden) {
                this.closeAboutFullscreen();
                this._setActiveRailButton(null);
                e.preventDefault();
            } else if (this.feedbackOverlay && !this.feedbackOverlay.hidden) {
                this.closeFeedbackFullscreen();
                this._setActiveRailButton(null);
                e.preventDefault();
            } else if (this.fullscreenVideoOverlay && !this.fullscreenVideoOverlay.hidden) {
                this.closeFullscreenVideo();
                this._setActiveRailButton(null);
                e.preventDefault();
            } else if (this._openSlidePanelId) {
                this.closeSlidePanel(this._openSlidePanelId);
                this._setActiveRailButton(null);
                e.preventDefault();
            }
        });
    }

    setupSlidePanels() {
        document.querySelectorAll('.slide-panel').forEach((panel) => {
            const id = panel.id.replace('slide-panel-', '');
            panel.querySelectorAll('.slide-panel-close, .slide-panel-backdrop').forEach((el) => {
                el.addEventListener('click', () => {
                    this.closeSlidePanel(id);
                    this._setActiveRailButton(null);
                });
            });
        });
    }

    openSlidePanel(which) {
        this.closeAboutFullscreen();
        this.closeFeedbackFullscreen();
        if (which === 'tags') {
            this._hideTagsRailContextHintImmediate();
        }
        if (which === 'tails') {
            this._hideTailsRailContextHintImmediate();
        }
        const panel = document.getElementById(`slide-panel-${which}`);
        if (!panel) return;
        document.querySelectorAll('.slide-panel.is-open').forEach((p) => {
            if (p !== panel) {
                p.classList.remove('is-open');
                p.setAttribute('aria-hidden', 'true');
            }
        });
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        this._openSlidePanelId = which;
    }

    closeSlidePanel(which) {
        const panel = document.getElementById(`slide-panel-${which}`);
        if (!panel) return;
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
        if (this._openSlidePanelId === which) this._openSlidePanelId = null;
    }

    closeAllSlidePanels() {
        document.querySelectorAll('.slide-panel.is-open').forEach((p) => {
            p.classList.remove('is-open');
            p.setAttribute('aria-hidden', 'true');
        });
        this._openSlidePanelId = null;
    }

    _setActiveRailButton(activeBtn) {
        if (!this.iconRail) return;
        this.iconRail.querySelectorAll('.icon-rail-btn').forEach((b) => b.classList.remove('is-active'));
        if (activeBtn) activeBtn.classList.add('is-active');
    }

    toggleFullscreenVideo() {
        if (!this.fullscreenVideoOverlay) return;
        const hidden = this.fullscreenVideoOverlay.hidden;
        if (hidden) {
            this.closeAboutFullscreen();
            this.closeFeedbackFullscreen();
            this._setActiveRailButton(null);
            this._syncVideoIframeAutoplay(true);
            this.fullscreenVideoOverlay.hidden = false;
            this.fullscreenVideoOverlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            document.dispatchEvent(new CustomEvent('fullscreenVideoOpen'));
        } else {
            this.closeFullscreenVideo();
        }
    }

    closeFullscreenVideo() {
        if (!this.fullscreenVideoOverlay) return;
        this._syncVideoIframeAutoplay(false);
        this.fullscreenVideoOverlay.hidden = true;
        this.fullscreenVideoOverlay.setAttribute('aria-hidden', 'true');
        this._refreshBodyOverflowForOverlays();
        document.dispatchEvent(new CustomEvent('fullscreenVideoClose'));
    }

    /** Autoplay only while fullscreen is open (avoids background audio on the graph view). */
    _syncVideoIframeAutoplay(enable) {
        const iframe = document.querySelector('#youtube-video-container iframe');
        if (!iframe) return;
        const id = this.selectedNode?.type === 'video' && this.selectedNode?.id ? this.selectedNode.id : null;
        if (!id) return;
        iframe.src = enable
            ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`
            : `https://www.youtube.com/embed/${id}?rel=0`;
    }

    /** After image search, reopen tags slide so gallery is visible. */
    ensureTagsSlideOpenForImages() {
        this.openSlidePanel('tags');
        this._setActiveRailButton(this.iconRail?.querySelector('.icon-rail-btn[data-open="tags"]'));
    }

    /**
     * Tags slide header: active tag and, once search completes, human-readable image sources.
     * @param {string | null | undefined} tag
     * @param {string[] | undefined} sourceNames — undefined = search in progress (hide sources line)
     */
    updateTagsSlideMeta(tag, sourceNames) {
        void sourceNames;
        const meta = document.getElementById('slide-tags-meta');
        if (!meta) return;
        if (tag == null || String(tag).trim() === '') {
            meta.innerHTML = '';
            meta.hidden = true;
            return;
        }
        const tagStr = String(tag).trim();
        const parts = [];
        parts.push(
            `<p class="slide-tags-meta__row"><span class="slide-tags-meta__k">Tag</span><span class="slide-tags-meta__v"> retrieved: ${escapeHtml(
                tagStr
            )}</span></p>`
        );
        meta.innerHTML = parts.join('');
        meta.hidden = false;
    }

    setTagsListButtonVisible(visible) {
        const listBtn = document.getElementById('slide-tags-list-btn');
        if (!listBtn) return;
        listBtn.hidden = !visible;
    }

    async initialize() {
        try {
            // Initialize chat interface after DOM is ready
            this.chatInterface = new ChatInterface();
            console.log('App: Chat interface initialized');
            
            await this.refreshData();
        } catch (error) {
            console.error('Failed to initialize application:', error);
        }
    }

    async refreshData() {
        try {
            const response = await fetch('data/videos.json');
            const rawData = await response.json();
            console.log("Fetched raw data:", rawData);

            // Store raw videos so panels can always derive tags by video id
            this.rawVideos = rawData;

            const dataProcessor = new DataProcessor(rawData);
            const processedData = dataProcessor.processData();
            console.log("Processed data:", processedData);

            this.networkGraph.setData(
                processedData.nodes, 
                processedData.links, 
                dataProcessor
            );

            this.setupVideoDetailsPanel();
            this.setupTagsPanel();
            this.setupTailCategoriesPanel();
            this.setupSearch();
            this.setupControls();
        } catch (error) {
            console.error('Failed to refresh data:', error);
        }
    }

    startDataRefresh() {
        this.refreshData();
    }

    stopDataRefresh() {
        if (this.dataRefreshTimer) {
            clearInterval(this.dataRefreshTimer);
            this.dataRefreshTimer = null;
        }
    }

    initializeEventListeners() {
        document.addEventListener('nodeSelected', (event) => {
            console.log('App: Node selected event received');
            console.log('App: Event detail:', event.detail);
            this.isInteracting = true;
            this.showLateralPanels();

            const node = event.detail.node;
            console.log('App: Selected node:', node);
            this.selectedNode = node; // Store the selected node for later use
            this.updateVideoDetails(node);
            // Right panel no longer shows tag list; tags live in bottom-left only
            // this.updateTagsPanel(node);
            this.updateTailCategoriesPanel(node);
            this.updateVideoPlayer(node);
            this.showBottomTags(node);
        });

        document.addEventListener('visualizationReset', () => {
            this.isInteracting = false;
            this.selectedNode = null;
            if (document.querySelector('.icon-rail')?.classList.contains('icon-rail--demo-tour')) {
                return;
            }
            this.hideLateralPanels();
        });

        document.addEventListener('tailNodeHover', (event) => {
            const tailLabel = event.detail.tail;
            this.highlightTailInPanel(tailLabel);
            this._showTailsRailContextHint();
        });

        document.addEventListener('tailNodeHoverEnd', () => {
            this._scheduleHideTailsRailContextHint();
        });

        document.addEventListener('tailNodeClick', (event) => {
            this._hideTailsRailContextHintImmediate();
            this.showLateralPanels();
            const tailLabel = event.detail.tail;
            this.moveTailToTop(tailLabel);
        });

        document.addEventListener('tailClick', (event) => {
            const tailLabel = event.detail.tail;
            if (this.chatInterface) {
                this.chatInterface.openChat(tailLabel);
            } else {
                console.error('App: Chat interface not available for tail click');
            }
        });

        document.addEventListener('tagNodeHover', (event) => {
            const tagLabel = event.detail.tag;
            this.highlightTagInPanel(tagLabel);
            this._showTagsRailContextHint();
        });

        document.addEventListener('tagNodeHoverEnd', () => {
            this._scheduleHideTagsRailContextHint();
        });

        document.addEventListener('tagNodeClick', (event) => {
            this._hideTagsRailContextHintImmediate();
            this.showLateralPanels();
            const tagLabel = event.detail.tag;
            this.moveTagToTop(tagLabel);
        });

        document.addEventListener('tagClick', (event) => {
            console.log('App: Tag click event received:', event.detail.tag);
            try {
                this.ensureTagsSlideOpenForImages();
            } catch (e) {
                /* non-fatal */
            }
            this.setTagsListButtonVisible(true);
            this.updateTagsSlideMeta(event.detail.tag, undefined);
            this.imageRepositories.searchImages(event.detail.tag);
        });

        document.addEventListener('tagsPanelImagesMeta', (event) => {
            const d = event.detail || {};
            this.updateTagsSlideMeta(d.tag, d.sourceNames);
        });

        document.addEventListener('returnToTags', (event) => {
            console.log('App: Return to tags event received', event);
            console.log('App: Selected node:', this.selectedNode);
            try {
                if (this.selectedNode) {
                    this.showBottomTags(this.selectedNode);
                    this.ensureTagsSlideOpenForImages();
                } else {
                    console.error('App: No selected node found, cannot return to tags');
                }
            } catch (error) {
                console.error('App: Error in returnToTags handler:', error);
            }
        });
    }

    setupVideoDetailsPanel() {
        this.videoMetadata = document.getElementById('slide-description-metadata');
        if (!this.videoMetadata) {
            console.error('slide-description-metadata not found');
        }
    }

    updateVideoDetails(node) {
        if (!this.videoMetadata) {
            console.error('Video details panel not properly initialized');
            return;
        }

        if (node.type !== 'video' || !node.data) {
            this.videoMetadata.innerHTML = '<p>No video details available</p>';
            return;
        }

        const metadata = node.data || {};
        const title = metadata.title || node.label || 'Video';
        const desc = metadata.description || '';

        this.videoMetadata.innerHTML = `
            <h3>${escapeHtml(title)}</h3>
            ${
                desc
                    ? `<div class="description-body">${formatPlainDescription(desc)}</div>
                <p style="margin-top:1rem;"><button type="button" class="description-button description-button--inline" id="slide-open-description-overlay">Open full-screen reader</button></p>`
                    : '<p>No description available for this video.</p>'
            }
        `;

        const expandBtn = this.videoMetadata.querySelector('#slide-open-description-overlay');
        if (expandBtn && desc) {
            expandBtn.addEventListener('click', () => this.openDescriptionOverlay(desc));
        }
    }

    openDescriptionOverlay(description) {
        // Create overlay if it doesn't exist
        let overlay = document.getElementById('description-overlay');
        if (!overlay) {
            overlay = this.createDescriptionOverlay();
        }
        
        // Update description content
        const descriptionContent = overlay.querySelector('.description-content');
        descriptionContent.innerHTML = formatPlainDescription(description);
        
        // Show overlay
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Focus overlay for keyboard navigation
        overlay.focus();
    }

    createDescriptionOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'description-overlay';
        overlay.className = 'description-overlay';
        overlay.setAttribute('tabindex', '0');
        
        overlay.innerHTML = `
            <div class="description-overlay-bg"></div>
            <div class="description-overlay-container">
                <button class="description-close" id="description-close">&times;</button>
                <div class="description-header">
                    <h2>Video Description</h2>
                </div>
                <div class="description-content">
                    <!-- Description content will be inserted here -->
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Add event listeners
        const closeBtn = overlay.querySelector('#description-close');
        const overlayBg = overlay.querySelector('.description-overlay-bg');
        
        closeBtn.addEventListener('click', () => this.closeDescriptionOverlay());
        overlayBg.addEventListener('click', () => this.closeDescriptionOverlay());
        
        // Keyboard navigation
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeDescriptionOverlay();
            }
        });
        
        return overlay;
    }

    closeDescriptionOverlay() {
        const overlay = document.getElementById('description-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    setupTagsPanel() {
        this.tagsPanel = document.querySelector('.tags-panel');
        // Tags moved to the tags slide (`#bottom-tags-list`); legacy `.tags-container` may be absent.
        this.tagsContainer =
            document.querySelector('.tags-container') ||
            document.getElementById('bottom-tags-list') ||
            document.querySelector('.bottom-tags-list');

        if (this.tagsContainer) {
            console.log('App: Tags list element bound for graph sync:', this.tagsContainer.id || this.tagsContainer.className);
        } else {
            console.error('App: No tags list element (.tags-container or #bottom-tags-list)');
        }

        const listBtn = document.getElementById('slide-tags-list-btn');
        if (listBtn) {
            const freshBtn = listBtn.cloneNode(true);
            listBtn.parentNode.replaceChild(freshBtn, listBtn);
            freshBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const returnToTagsEvent = new CustomEvent('returnToTags', {
                    bubbles: true,
                    cancelable: true,
                });
                document.dispatchEvent(returnToTagsEvent);
            });
        }
        this.setTagsListButtonVisible(false);
    }

    updateTagsPanel(node) {
        // Right panel tags panel is no longer used; tags are shown only in the bottom panel
        if (this.tagsPanel) {
            this.tagsPanel.classList.add('hidden');
        }
    }

    setupTailCategoriesPanel() {
        this.tailCategoriesPanel = document.getElementById('slide-panel-tails');
        this.tailCategoriesContainer = document.querySelector('.tail-categories-panel-slide');
        
        console.log('Setting up tail categories panel:', {
            panel: this.tailCategoriesPanel,
            container: this.tailCategoriesContainer
        });
        
        if (this.tailCategoriesContainer && this.chatInterface) {
            // Use chat interface to handle tail category clicks and open the chat dialog
            this.chatInterface.setupTailClickHandlers(this.tailCategoriesContainer);
            console.log('Tail categories panel initialized with chat handlers');
        }
    }

    updateTailCategoriesPanel(node) {
        if (!this.tailCategoriesContainer) {
            console.error('Tail categories panel not properly initialized');
            return;
        }

        this.tailCategoriesContainer.innerHTML = '';

        if (node.type !== 'video' || !node.data || !node.data.tails || node.data.tails.length === 0) {
            this.tailCategoriesContainer.innerHTML = '<p>No tails available</p>';
            return;
        }

        this.selectedNode = node;

        node.data.tails.forEach(tail => {
            const tailElement = document.createElement('div');
            tailElement.classList.add('tail-category');
            tailElement.textContent = tail;
            tailElement.setAttribute('data-tail', tail);
            this.tailCategoriesContainer.appendChild(tailElement);
        });
    }

    updateVideoPlayer(node) {
        const videoContainer = document.getElementById('youtube-video-container');

        if (!videoContainer) {
            console.error('YouTube video container not found');
            return;
        }

        videoContainer.innerHTML = '';

        if (node.type === 'video' && node.id) {
            const videoId = node.id;
            const iframe = document.createElement('iframe');
            iframe.width = '100%';
            iframe.height = '100%';
            iframe.src = `https://www.youtube.com/embed/${videoId}?rel=0`;
            iframe.title = 'YouTube video player';
            iframe.frameBorder = '0';
            iframe.allow =
                'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            iframe.allowFullscreen = true;

            videoContainer.appendChild(iframe);
        } else {
            videoContainer.innerHTML = '<p>No video available for this node.</p>';
        }
    }

    setupSearch() {
        // Implementation for search functionality can be added here
    }

    setupControls() {
        // Implementation for additional controls can be added here
    }

    destroy() {
        this.stopDataRefresh();
        this.networkGraph.destroy();
    }

    buildTagTailsRelations() {
        return {
            "environmental racism": [
                "Land Extraction",
                "Colonial Act",
                "Economic Dispossession",
                "Epistemological Empire"
            ],
            "Climate Change": [
                "Anthropocene",
                "Capitalocene",
                "Materiality",
                "Energy"
            ],
            "Decolonization": [
                "Indigenous Epistemologies",
                "Land Extraction",
                "Colonial Act",
                "Economic Dispossession"
            ],
            "humanities": [
                "Epistemological Empire",
                "Scientific Statement",
                "Reflective Aesthetic Statement",
                "Ethics Statement"
            ]
            // Add more mappings based on your data analysis
        };
    }

    handleTagClick(tagElement) {
        const wasActive = tagElement.classList.contains('active');
        
        // Reset all tag categories
        document.querySelectorAll('.tag').forEach(el => {
            el.classList.remove('active');
        });
        
        if (!wasActive) {
            tagElement.classList.add('active');
            const list = this._getTagsListEl();
            if (list) list.insertBefore(tagElement, list.firstChild);
            
            // Handle related tails if needed
            const relatedTails = this.tagTailsRelations[tagElement.textContent] || [];
            document.querySelectorAll('.tail-category').forEach(tail => {
                if (relatedTails.includes(tail.textContent)) {
                    tail.classList.add('highlighted');
                }
            });
        }
    }

    handleTailClick(tailElement) {
        console.log('Handling tail click:', {
            element: tailElement,
            wasActive: tailElement.classList.contains('active')
        });
        
        const wasActive = tailElement.classList.contains('active');
        
        // Reset all tail categories
        document.querySelectorAll('.tail-category').forEach(el => {
            el.classList.remove('active');
        });
        
        if (!wasActive) {
            tailElement.classList.add('active');
            console.log('Moving tail to top:', tailElement.textContent);
            const currentPosition = tailElement.getBoundingClientRect();
            this.tailCategoriesContainer.insertBefore(tailElement, this.tailCategoriesContainer.firstChild);
            console.log('New position in DOM:', {
                previousSibling: tailElement.previousSibling,
                nextSibling: tailElement.nextSibling
            });
        }
    }

    handleTailHover(tailElement) {
        console.log('Handling tail hover:', {
            element: tailElement,
            isActive: tailElement.classList.contains('active')
        });
        
        tailElement.classList.add('highlighted');
        if (!tailElement.classList.contains('active')) {
            console.log('Moving hovered tail to top');
            const currentPosition = tailElement.getBoundingClientRect();
            this.tailCategoriesContainer.insertBefore(tailElement, this.tailCategoriesContainer.firstChild);
            console.log('New position after hover:', {
                previousSibling: tailElement.previousSibling,
                nextSibling: tailElement.nextSibling
            });
        }
    }

    handleTailUnhover(tailElement) {
        console.log('Handling tail unhover:', {
            element: tailElement,
            isActive: tailElement.classList.contains('active')
        });
        
        if (!tailElement.classList.contains('active')) {
            tailElement.classList.remove('highlighted');
            console.log('Restoring original order');
            this.restoreOriginalOrder();
        }
    }

    restoreOriginalOrder() {
        if (!this.selectedNode || !this.selectedNode.data || !this.selectedNode.data.tails) {
            console.log('Cannot restore order - missing node data');
            return;
        }
        
        console.log('Restoring original order:', {
            selectedNode: this.selectedNode,
            tails: this.selectedNode.data.tails
        });
        
        const tails = this.selectedNode.data.tails;
        const container = this.tailCategoriesContainer;
        const fragments = document.createDocumentFragment();
        
        tails.forEach(tail => {
            const existingTail = container.querySelector(`.tail-category[data-tail="${tail}"]`);
            console.log('Processing tail:', {
                tail: tail,
                found: !!existingTail
            });
            if (existingTail) {
                fragments.appendChild(existingTail);
            }
        });
        
        container.innerHTML = '';
        container.appendChild(fragments);
        console.log('Order restored');
    }

    highlightTailInPanel(tailLabel) {
        if (!this.tailCategoriesContainer) return;

        const tailElement = this.tailCategoriesContainer.querySelector(
            `.tail-category[data-tail="${tailLabel}"]`
        );

        if (tailElement) {
            // Remove highlight from all tails
            this.tailCategoriesContainer.querySelectorAll('.tail-category')
                .forEach(el => el.classList.remove('highlighted'));
            
            // Add highlight to the hovered tail
            tailElement.classList.add('highlighted');
            
            // Move to top temporarily
            this.tailCategoriesContainer.insertBefore(tailElement, this.tailCategoriesContainer.firstChild);
        }
    }

    moveTailToTop(tailLabel) {
        if (!this.tailCategoriesContainer) return;

        const tailElement = this.tailCategoriesContainer.querySelector(
            `.tail-category[data-tail="${tailLabel}"]`
        );

        if (tailElement) {
            // Remove active state from all tails
            this.tailCategoriesContainer.querySelectorAll('.tail-category')
                .forEach(el => el.classList.remove('active'));
            
            // Add active state to clicked tail
            tailElement.classList.add('active');
            
            // Move to top
            this.tailCategoriesContainer.insertBefore(tailElement, this.tailCategoriesContainer.firstChild);
        }
    }

    handleTagHover(tagElement) {
        const list = this._getTagsListEl();
        if (!list) return;

        console.log('Tag hover triggered:', {
            element: tagElement,
            text: tagElement.textContent,
            isActive: tagElement.classList.contains('active'),
            container: list,
            currentPosition: tagElement.getBoundingClientRect()
        });
        
        list.querySelectorAll('.tag').forEach(el => {
            el.classList.remove('highlighted');
        });
        
        tagElement.classList.add('highlighted');
        
        const firstChild = list.firstChild;
        if (firstChild !== tagElement) {
            console.log('Moving tag to top:', {
                tagToMove: tagElement.textContent,
                currentFirst: firstChild?.textContent
            });
            
            Array.from(list.children);
            tagElement.remove();
            list.insertBefore(tagElement, list.firstChild);
            
            console.log('New order:', Array.from(list.children).map(el => el.textContent));
        }
    }

    handleTagUnhover(tagElement) {
        console.log('Tag unhover triggered:', {
            element: tagElement,
            text: tagElement.textContent,
            isActive: tagElement.classList.contains('active')
        });
        
        if (!tagElement.classList.contains('active')) {
            tagElement.classList.remove('highlighted');
            this.restoreTagsOrder();
        }
    }

    restoreTagsOrder() {
        if (!this.selectedNode || !this.selectedNode.data || !this.selectedNode.data.tags) {
            console.log('Cannot restore tags order - missing node data');
            return;
        }
        
        const tags = this.selectedNode.data.tags;
        const container = this._getTagsListEl();
        if (!container) return;
        
        // Store current elements
        const currentElements = Array.from(container.children);
        
        // Clear container
        container.innerHTML = '';
        
        // Restore original order
        tags.forEach(tag => {
            const existingTag = currentElements.find(el => el.getAttribute('data-tag') === tag);
            if (existingTag) {
                container.appendChild(existingTag);
            }
        });
        
        console.log('Tags restored to original order:', 
            Array.from(container.children).map(el => el.textContent)
        );
    }

    highlightTagInPanel(tagLabel) {
        const list = this._getTagsListEl();
        if (!list) return;

        const tagElement = list.querySelector(
            `.tag[data-tag="${tagLabel}"]`
        );

        if (tagElement) {
            list.querySelectorAll('.tag')
                .forEach(el => el.classList.remove('highlighted'));
            tagElement.classList.add('highlighted');
            list.insertBefore(tagElement, list.firstChild);
        }
    }

    _showTagsRailContextHint() {
        if (this._tagsRailHintHideTimer) {
            clearTimeout(this._tagsRailHintHideTimer);
            this._tagsRailHintHideTimer = null;
        }
        const btn = document.querySelector('.icon-rail-btn[data-open="tags"]');
        const hint = document.getElementById('icon-rail-tags-hint');
        const rail = document.querySelector('.icon-rail');
        if (!btn || !hint || !rail || rail.classList.contains('hidden')) {
            return;
        }
        btn.classList.add('icon-rail-btn--context-hint');
        hint.hidden = false;
        hint.setAttribute('aria-hidden', 'false');
        const r = btn.getBoundingClientRect();
        const gap = 12;
        hint.style.left = `${Math.round(r.right + gap)}px`;
        hint.style.top = `${Math.round(r.top + r.height / 2)}px`;
        hint.classList.add('icon-rail-context-hint--visible');
    }

    _scheduleHideTagsRailContextHint() {
        if (this._tagsRailHintHideTimer) {
            clearTimeout(this._tagsRailHintHideTimer);
        }
        this._tagsRailHintHideTimer = setTimeout(() => {
            this._tagsRailHintHideTimer = null;
            this._hideTagsRailContextHint();
        }, 80);
    }

    _hideTagsRailContextHintImmediate() {
        if (this._tagsRailHintHideTimer) {
            clearTimeout(this._tagsRailHintHideTimer);
            this._tagsRailHintHideTimer = null;
        }
        this._hideTagsRailContextHint();
    }

    _hideTagsRailContextHint() {
        const btn = document.querySelector('.icon-rail-btn[data-open="tags"]');
        const hint = document.getElementById('icon-rail-tags-hint');
        if (btn) btn.classList.remove('icon-rail-btn--context-hint');
        if (hint) {
            hint.hidden = true;
            hint.setAttribute('aria-hidden', 'true');
            hint.classList.remove('icon-rail-context-hint--visible');
            hint.style.left = '';
            hint.style.top = '';
        }
    }

    _showTailsRailContextHint() {
        if (this._tailsRailHintHideTimer) {
            clearTimeout(this._tailsRailHintHideTimer);
            this._tailsRailHintHideTimer = null;
        }
        const btn = document.querySelector('.icon-rail-btn[data-open="tails"]');
        const hint = document.getElementById('icon-rail-tails-hint');
        const rail = document.querySelector('.icon-rail');
        if (!btn || !hint || !rail || rail.classList.contains('hidden')) {
            return;
        }
        btn.classList.add('icon-rail-btn--context-hint');
        hint.hidden = false;
        hint.setAttribute('aria-hidden', 'false');
        const r = btn.getBoundingClientRect();
        const gap = 12;
        hint.style.left = `${Math.round(r.right + gap)}px`;
        hint.style.top = `${Math.round(r.top + r.height / 2)}px`;
        hint.classList.add('icon-rail-context-hint--visible');
    }

    _scheduleHideTailsRailContextHint() {
        if (this._tailsRailHintHideTimer) {
            clearTimeout(this._tailsRailHintHideTimer);
        }
        this._tailsRailHintHideTimer = setTimeout(() => {
            this._tailsRailHintHideTimer = null;
            this._hideTailsRailContextHint();
        }, 80);
    }

    _hideTailsRailContextHintImmediate() {
        if (this._tailsRailHintHideTimer) {
            clearTimeout(this._tailsRailHintHideTimer);
            this._tailsRailHintHideTimer = null;
        }
        this._hideTailsRailContextHint();
    }

    _hideTailsRailContextHint() {
        const btn = document.querySelector('.icon-rail-btn[data-open="tails"]');
        const hint = document.getElementById('icon-rail-tails-hint');
        if (btn) btn.classList.remove('icon-rail-btn--context-hint');
        if (hint) {
            hint.hidden = true;
            hint.setAttribute('aria-hidden', 'true');
            hint.classList.remove('icon-rail-context-hint--visible');
            hint.style.left = '';
            hint.style.top = '';
        }
    }

    moveTagToTop(tagLabel) {
        const list = this._getTagsListEl();
        if (!list) return;

        const tagElement = list.querySelector(
            `.tag[data-tag="${tagLabel}"]`
        );

        if (tagElement) {
            list.querySelectorAll('.tag')
                .forEach(el => el.classList.remove('active'));
            tagElement.classList.add('active');
            list.insertBefore(tagElement, list.firstChild);
        }
    }

    setupBottomPanel() {
        this.bottomPanel = document.getElementById('panel-tags-body');
        this.bottomTagsContainer = document.getElementById('bottom-tags-container');
        this.bottomTagsList = document.getElementById('bottom-tags-list');
        this.bottomDefaultContent = document.getElementById('bottom-default-content');

        // Single delegated listener on the panel so innerHTML swaps don't stack handlers
        if (this.bottomPanel && !this._bottomPanelTagClickBound) {
            this._bottomPanelTagClickBound = true;
            this.bottomPanel.addEventListener('click', (event) => {
                const tagElement = event.target.closest('.bottom-tags-list .tag');
                if (tagElement) {
                    const tagLabel = tagElement.textContent.trim();
                    console.log('Tag clicked in bottom panel:', tagLabel);
                    this.showImagesForTag(tagLabel);
                }
            });
        }
    }

    /**
     * Tags repeated at the start of most Entanglement videos in videos.json (lab / project themes).
     * They are correct per video but look identical when shown first — show distinctive tags first.
     */
    static _PROJECT_ANCHOR_TAGS = new Set(
        [
            'race',
            'humanities',
            'climate change',
            'decolonization',
            'global blackness',
            'black people',
            'racism',
            'environmental racism',
            'displacement',
            'poet',
            'visualizations',
            'anticolonial',
            'feminist',
        ].map((t) => t.toLowerCase())
    );

    /** Put video-specific tags first; project-wide anchors last (same relative order within each group). */
    _orderBottomPanelTags(tags) {
        if (!Array.isArray(tags) || !tags.length) return [];
        const distinctive = [];
        const anchors = [];
        for (const t of tags) {
            const key = String(t).toLowerCase().trim();
            if (App._PROJECT_ANCHOR_TAGS.has(key)) anchors.push(t);
            else distinctive.push(t);
        }
        return [...distinctive, ...anchors];
    }

    /** Tags for the selected graph node: prefer node.data (always matches the clicked node). */
    _getTagsForVideoNode(node) {
        if (!node || node.type !== 'video') return [];
        const fromData = Array.isArray(node.data?.tags) ? [...node.data.tags] : [];
        if (fromData.length || !this.rawVideos || node.id == null) return fromData;
        const video = this.rawVideos.find(
            (v) => v.id === node.id || String(v.id) === String(node.id)
        );
        return Array.isArray(video?.tags) ? [...video.tags] : [];
    }

    showBottomTags(node) {
        console.log('showBottomTags: Called with node:', node);

        this.bottomPanel = document.getElementById('panel-tags-body');
        if (!this.bottomPanel) {
            console.error('showBottomTags: bottom panel not found');
            return;
        }
        if (!node || node.type !== 'video') {
            console.warn('showBottomTags: expected video node', node);
            return;
        }

        const videoId = node.id;
        const tags = this._orderBottomPanelTags(this._getTagsForVideoNode(node));

        if (!tags.length) {
            console.warn('showBottomTags: No tags for video id', videoId, node);
        }

        if (this.imageRepositories) {
            this.imageRepositories.bottomPanel = this.bottomPanel;
        }

        this.updateTagsSlideMeta(null);
        this.setTagsListButtonVisible(false);

        // Clear any existing image gallery or tag content
        console.log('showBottomTags: Resetting bottom panel for tags view');
        this.bottomPanel.innerHTML = `
            <!-- Tags container for video tags -->
            <div class="bottom-tags-container" id="bottom-tags-container" style="display: flex;">
                <div class="bottom-tags-list" id="bottom-tags-list"></div>
            </div>
            
            <!-- Default content (hidden when tags are visible) -->
            <div class="bottom-default-content" id="bottom-default-content" style="display: none;">
                <h3>Bottom Panel</h3>
                <p>Static content for future use</p>
            </div>
        `;

        // Re-get references to the elements after resetting the panel
        this.bottomTagsContainer = document.getElementById('bottom-tags-container');
        this.bottomTagsList = document.getElementById('bottom-tags-list');
        this.bottomDefaultContent = document.getElementById('bottom-default-content');

        console.log('showBottomTags: Re-acquired elements:', {
            bottomTagsContainer: !!this.bottomTagsContainer,
            bottomTagsList: !!this.bottomTagsList,
            bottomDefaultContent: !!this.bottomDefaultContent
        });

        // Re-setup event listeners for tag clicks in the bottom panel
        this.setupBottomPanel();

        // Populate tags for the selected video
        if (tags.length && this.bottomTagsList) {
            console.log('showBottomTags: Creating tags for video', videoId, ':', tags);
            tags.forEach(tag => {
                const tagElement = document.createElement('div');
                tagElement.classList.add('tag');
                tagElement.textContent = tag;
                tagElement.setAttribute('data-tag', tag);
                this.bottomTagsList.appendChild(tagElement);
            });

            this.bottomTagsContainer.style.display = 'flex';
            if (this.bottomDefaultContent) {
                this.bottomDefaultContent.style.display = 'none';
            }

            console.log('showBottomTags: Tags displayed successfully', {
                bottomPanelHTML: this.bottomPanel.innerHTML.length,
                tagsContainerDisplay: this.bottomTagsContainer.style.display,
                tagsCount: this.bottomTagsList.children.length
            });
        } else if (this.bottomDefaultContent) {
            // No tags for this video: show default content
            this.bottomTagsContainer.style.display = 'none';
            this.bottomDefaultContent.style.display = 'block';
        }
    }

    hideBottomTags() {
        if (!this.bottomPanel || !this.bottomTagsContainer) return;

        // Hide tags container
        this.bottomTagsContainer.style.display = 'none';
        
        // Show the default content
        if (this.bottomDefaultContent) {
            this.bottomDefaultContent.style.display = 'block';
        }

        if (this.imageRepositories && this.imageRepositories.bottomPanel) {
            this.imageRepositories.bottomPanel.innerHTML = `
                <div class="bottom-tags-container" id="bottom-tags-container" style="display: none;">
                    <div class="bottom-tags-list" id="bottom-tags-list"></div>
                </div>
                <div class="bottom-default-content" id="bottom-default-content">
                    <p class="slide-panel-hint">Select a video on the graph, then choose a tag to search images.</p>
                </div>`;
            this.setupBottomPanel();
        }
    }

    showImagesForTag(tagLabel) {
        if (!this.bottomPanel || !this.bottomTagsContainer) return;

        // Hide tags container
        this.bottomTagsContainer.style.display = 'none';
        
        // Hide the default content
        if (this.bottomDefaultContent) {
            this.bottomDefaultContent.style.display = 'none';
        }

        // Trigger image search
        const tagClickEvent = new CustomEvent('tagClick', {
            detail: { tag: tagLabel }
        });
        document.dispatchEvent(tagClickEvent);
    }
}

/**
 * One-time hint after entering the graph from the welcome screen; hides after the first
 * graph node interaction (video selection, tag node, or tail node).
 */
function initGraphExplorationHint() {
    const el = document.getElementById('graph-exploration-hint');
    if (!el) return;

    const graphContainer = el.closest('.graph-container');
    const closeBtn = el.querySelector('.graph-exploration-hint__close');

    let consumed = false;

    const nudgeGraphLayout = () => {
        requestAnimationFrame(() => {
            try {
                window.app?.networkGraph?.handleResize?.();
            } catch {
                /* ignore */
            }
        });
    };

    const dismiss = () => {
        if (consumed) return;
        consumed = true;
        el.classList.remove('graph-exploration-hint--visible');
        el.classList.add('graph-exploration-hint--dismissed');
        el.setAttribute('aria-hidden', 'true');
        graphContainer?.classList.remove('graph-container--hint-gutter');
        el.hidden = true;
        document.removeEventListener('nodeSelected', dismiss);
        document.removeEventListener('tagNodeClick', dismiss);
        document.removeEventListener('tailNodeClick', dismiss);
        nudgeGraphLayout();
    };

    document.addEventListener('nodeSelected', dismiss);
    document.addEventListener('tagNodeClick', dismiss);
    document.addEventListener('tailNodeClick', dismiss);
    closeBtn?.addEventListener('click', dismiss);

    window.__showGraphExplorationHint = () => {
        if (consumed) return;
        el.hidden = false;
        el.setAttribute('aria-hidden', 'false');
        graphContainer?.classList.add('graph-container--hint-gutter');
        requestAnimationFrame(() => {
            el.classList.add('graph-exploration-hint--visible');
            nudgeGraphLayout();
        });
    };
}

/**
 * After the first black (video) node is selected, a short tip on tags (yellow) vs tails (red).
 * Shown fixed at the top-right of the viewport. Dismissed by close, or by tapping a yellow or red graph node.
 */
function initGraphVideoFollowupHint() {
    const el = document.getElementById('graph-video-hint');
    if (!el) return;
    const closeBtn = el.querySelector('.graph-video-hint__close');

    let dismissed = false;
    let hintActive = false;

    const teardown = () => {
        document.removeEventListener('nodeSelected', onVideoNodeSelected);
        document.removeEventListener('tagNodeClick', dismiss);
        document.removeEventListener('tailNodeClick', dismiss);
        closeBtn?.removeEventListener('click', dismiss);
    };

    const dismiss = () => {
        if (dismissed || !hintActive) return;
        dismissed = true;
        hintActive = false;
        el.classList.remove('graph-video-hint--visible');
        el.setAttribute('aria-hidden', 'true');
        el.hidden = true;
        teardown();
    };

    const onVideoNodeSelected = (event) => {
        if (dismissed || hintActive) return;
        const node = event.detail?.node;
        if (!node || node.type !== 'video') return;

        hintActive = true;
        el.hidden = false;
        el.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => el.classList.add('graph-video-hint--visible'));
    };

    document.addEventListener('nodeSelected', onVideoNodeSelected);
    document.addEventListener('tagNodeClick', dismiss);
    document.addEventListener('tailNodeClick', dismiss);
    closeBtn?.addEventListener('click', dismiss);
}

/** Welcome dismissed → show again after this much idle time (ms). */
const WELCOME_INACTIVITY_MS = 5 * 60 * 1000;
/** Avoid resetting the idle timer on every mousemove tick. */
const WELCOME_ACTIVITY_MOUSEMOVE_THROTTLE_MS = 900;

/**
 * Full-screen welcome before graph interaction (dismiss with “Enter visualization”).
 * Re-opens automatically after {@link WELCOME_INACTIVITY_MS} of no user activity.
 */
function initWelcomeScreen(kiosk) {
    const root = document.getElementById('welcome-screen');
    const enter = document.getElementById('welcome-enter');
    const demo = document.getElementById('welcome-demo');
    const hint = document.getElementById('welcome-demo-hint');
    if (!root || !enter) return;

    let inactivityTimerId = null;
    /** True after first (or subsequent) “Enter visualization” while welcome is hidden. */
    let appUnlocked = false;
    let lastMouseMoveArm = 0;
    /** While true, idle timeout is paused (e.g. fullscreen video playing). */
    let videoIdlePause = false;

    function clearInactivityTimer() {
        if (inactivityTimerId != null) {
            window.clearTimeout(inactivityTimerId);
            inactivityTimerId = null;
        }
    }

    function armInactivityTimer() {
        clearInactivityTimer();
        if (!appUnlocked || document.hidden || videoIdlePause) return;
        inactivityTimerId = window.setTimeout(() => {
            inactivityTimerId = null;
            showWelcomeDueToInactivity();
        }, WELCOME_INACTIVITY_MS);
    }

    function onUserActivity() {
        if (!appUnlocked) return;
        armInactivityTimer();
    }

    function onPointerMoveThrottled() {
        if (!appUnlocked) return;
        const now = Date.now();
        if (now - lastMouseMoveArm < WELCOME_ACTIVITY_MOUSEMOVE_THROTTLE_MS) return;
        lastMouseMoveArm = now;
        armInactivityTimer();
    }

    function closeAuxiliaryUi() {
        try {
            window.app?.closeDescriptionOverlay?.();
        } catch {
            /* ignore */
        }
        try {
            window.app?.chatInterface?.closeChat?.();
        } catch {
            /* ignore */
        }
        const gallery = document.getElementById('image-gallery-modal');
        if (gallery) gallery.style.display = 'none';
        try {
            document.querySelector('.icon-rail')?.classList.remove('icon-rail--demo-tour');
            document.body.classList.remove('interface-demo-tour-active');
            window.app?.hideLateralPanels?.();
        } catch {
            /* ignore */
        }
        try {
            window.app?.closeAboutFullscreen?.();
        } catch {
            /* ignore */
        }
        try {
            window.app?.closeFeedbackFullscreen?.();
        } catch {
            /* ignore */
        }
    }

    function showWelcomeDueToInactivity() {
        // Never interrupt a fullscreen video with the welcome screen.
        try {
            const videoOpen =
                window.app &&
                window.app.fullscreenVideoOverlay &&
                !window.app.fullscreenVideoOverlay.hidden;
            if (videoOpen) {
                return;
            }
        } catch {
            /* ignore */
        }
        appUnlocked = false;
        clearInactivityTimer();
        closeAuxiliaryUi();

        resetWelcomePageTransition();

        root.classList.remove('welcome-screen--removed', 'welcome-screen--hidden');
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('welcome-active');
        document.body.style.overflow = '';

        if (hint) {
            hint.hidden = true;
            hint.textContent = '';
        }
    }

    /** Used after the guided demo completes so the user returns to the same landing as idle-timeout. */
    window.__showWelcomeScreen = showWelcomeDueToInactivity;

    let welcomeTransitionRunning = false;

    function dismissWelcome(options = {}) {
        const { startDemoTour = false } = options;
        if (welcomeTransitionRunning) return;
        welcomeTransitionRunning = true;
        enter.disabled = true;

        runWelcomePageTransition({
            onMaskHold: () => {
                root.classList.add('welcome-screen--removed');
                root.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('welcome-active');
                requestAnimationFrame(() => {
                    try {
                        window.app?.networkGraph?.handleResize?.();
                    } catch {
                        /* ignore */
                    }
                });
            },
            onComplete: () => {
                welcomeTransitionRunning = false;
                enter.disabled = false;
                appUnlocked = true;
                armInactivityTimer();
                requestAnimationFrame(() => {
                    try {
                        window.app?.networkGraph?.handleResize?.();
                    } catch {
                        /* ignore */
                    }
                });
                window.__showGraphExplorationHint?.();
                if (startDemoTour) {
                    window.setTimeout(() => {
                        import('./scripts/interfaceTour.js')
                            .then((m) => m.startInterfaceDemoTour())
                            .catch((e) => console.warn('Demo tour failed to load', e));
                    }, 450);
                }
            },
        });
    }

    document.body.classList.add('welcome-active');

    enter.addEventListener('click', () => {
        kiosk?.enterFullscreenFromGesture?.();
        dismissWelcome();
    });

    demo?.addEventListener('click', () => {
        if (hint) {
            hint.hidden = true;
            hint.textContent = '';
        }
        kiosk?.enterFullscreenFromGesture?.();
        dismissWelcome({ startDemoTour: true });
    });

    const activityOpts = { capture: true, passive: true };
    ['pointerdown', 'keydown', 'touchstart', 'click', 'wheel'].forEach((type) => {
        window.addEventListener(type, onUserActivity, activityOpts);
    });
    window.addEventListener('scroll', onUserActivity, { passive: true });
    window.addEventListener('mousemove', onPointerMoveThrottled, activityOpts);
    window.addEventListener('touchmove', onPointerMoveThrottled, activityOpts);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInactivityTimer();
        } else if (appUnlocked && !videoIdlePause) {
            armInactivityTimer();
        }
    });

    // Pause idle timeout while fullscreen video is open.
    document.addEventListener('fullscreenVideoOpen', () => {
        videoIdlePause = true;
        clearInactivityTimer();
    });
    document.addEventListener('fullscreenVideoClose', () => {
        videoIdlePause = false;
        if (appUnlocked && !document.hidden) {
            armInactivityTimer();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const kiosk = initKioskMode();
    window.__kioskSession = kiosk;
    initGraphExplorationHint();
    initGraphVideoFollowupHint();
    initWelcomeScreen(kiosk);
    const app = new App();
    window.app = app; // Make app instance globally available for fallback
    app.initialize();

    if (kiosk.isEnabled?.()) {
        const tryFs = () => kiosk.tryEnterFullscreen?.();
        requestAnimationFrame(() => requestAnimationFrame(tryFs));
        const onFirstInteraction = () => {
            tryFs();
            document.removeEventListener('pointerdown', onFirstInteraction, { capture: true });
            document.removeEventListener('keydown', onFirstInteraction, { capture: true });
        };
        document.addEventListener('pointerdown', onFirstInteraction, { capture: true, passive: true });
        document.addEventListener('keydown', onFirstInteraction, { capture: true, passive: true });
    }
});

const tagTailsRelations = {
  "environmental racism": [
    "Land Extraction",
    "Colonial Act",
    "Economic Dispossession",
    "Epistemological Empire"
  ],
  "Climate Change": [
    "Anthropocene",
    "Capitalocene",
    "Materiality",
    "Energy"
  ]
  // ... more mappings
};

function handleTagClick(tag) {
    document.querySelectorAll('.tag').forEach(t => 
        t.classList.toggle('active', t.textContent === tag));
    
    const relatedTails = tagTailsRelations[tag] || [];
    document.querySelectorAll('.tail').forEach(tail => 
        tail.classList.toggle('highlighted', relatedTails.includes(tail.textContent)));
}

function analyzeCoOccurrences(videos) {
    const coOccurrenceMap = new Map();
    
    videos.forEach(video => {
        video.tags.forEach(tag => {
            video.tails.forEach(tail => {
                const key = `${tag}:${tail}`;
                coOccurrenceMap.set(key, (coOccurrenceMap.get(key) || 0) + 1);
            });
        });
    });
    
    return coOccurrenceMap;
}

function highlightRelatedItems(selectedItem, type) {
    const threshold = 2;
    const relatedItems = Array.from(coOccurrenceMap.entries())
        .filter(([key, count]) => {
            const [tag, tail] = key.split(':');
            return (type === 'tag' ? tag === selectedItem : tail === selectedItem) 
                && count >= threshold;
        })
        .map(([key]) => key.split(':')[type === 'tag' ? 1 : 0]);
        
    highlightElements(relatedItems, type === 'tag' ? '.tail' : '.tag');
}

class FilterSystem {
    constructor() {
        this.selectedTags = new Set();
        this.selectedTails = new Set();
    }
    
    toggleTag(tag) {
        if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
        } else {
            this.selectedTags.add(tag);
        }
        this.updateVisualization();
    }
    
    toggleTail(tail) {
        if (this.selectedTails.has(tail)) {
            this.selectedTails.delete(tail);
        } else {
            this.selectedTails.add(tail);
        }
        this.updateVisualization();
    }
    
    updateVisualization() {
        const filteredVideos = videos.filter(video => {
            const hasSelectedTags = this.selectedTags.size === 0 || 
                video.tags.some(tag => this.selectedTags.has(tag));
            const hasSelectedTails = this.selectedTails.size === 0 || 
                video.tails.some(tail => this.selectedTails.has(tail));
            return hasSelectedTags && hasSelectedTails;
        });
        
        networkGraph.updateData(filteredVideos);
        
        updateFilterUI(this.selectedTags, this.selectedTails);
    }
}