import './styles/main.css';
import { NetworkGraph } from './scripts/NetworkGraph';
import { DataProcessor } from './scripts/DataProcessor';
import { ImageRepositories } from './scripts/ImageAPIs';
import { ChatInterface } from './scripts/ChatInterface';

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

        this.initializeEventListeners();
        this.tagTailsRelations = this.buildTagTailsRelations();
        this.setupBottomPanel();
        this.setupTagsPanel();
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
            this.rightPanel = document.querySelector('.right-panel');
            this.leftPanel = document.querySelector('.left-panel');
            
            if (this.rightPanel) {
                this.rightPanel.classList.remove('hidden');
            }
    
            if (this.leftPanel) {
                this.leftPanel.classList.remove('hidden');
            }
    
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
        });

        document.addEventListener('tailNodeHover', (event) => {
            const tailLabel = event.detail.tail;
            this.highlightTailInPanel(tailLabel);
        });

        document.addEventListener('tailNodeClick', (event) => {
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
        });

        document.addEventListener('tagNodeClick', (event) => {
            const tagLabel = event.detail.tag;
            this.moveTagToTop(tagLabel);
        });

        document.addEventListener('tagClick', (event) => {
            console.log('App: Tag click event received:', event.detail.tag);
            this.imageRepositories.searchImages(event.detail.tag);
        });

        document.addEventListener('returnToTags', (event) => {
            console.log('App: Return to tags event received', event);
            console.log('App: Selected node:', this.selectedNode);
            try {
                if (this.selectedNode) {
                    this.showBottomTags(this.selectedNode);
                } else {
                    console.error('App: No selected node found, cannot return to tags');
                }
            } catch (error) {
                console.error('App: Error in returnToTags handler:', error);
            }
        });
    }

    setupVideoDetailsPanel() {
        this.videoInfoPanel = document.querySelector('.video-info-panel');
        this.videoMetadata = this.videoInfoPanel.querySelector('.video-metadata');
        
        if (!this.videoInfoPanel || !this.videoMetadata) {
            console.error('Video details panel elements not found');
            return;
        }
    }

    updateVideoDetails(node) {
        if (!this.videoInfoPanel || !this.videoMetadata) {
            console.error('Video details panel not properly initialized');
            return;
        }

        this.videoInfoPanel.classList.remove('hidden');

        if (node.type !== 'video' || !node.data) {
            this.videoMetadata.innerHTML = '<p>No video details available</p>';
            return;
        }

        const metadata = node.data || {};
        const metadataHTML = `
            <h3>${metadata.title || node.label}</h3>
            ${metadata.description ? `
                <button class="description-button" data-description="${metadata.description.replace(/"/g, '&quot;')}">
                    <span class="button-icon">📄</span>
                    <span class="button-text">View Description</span>
                </button>
            ` : ''}
        `;
        this.videoMetadata.innerHTML = metadataHTML;
        
        // Add click handler for description button
        const descriptionButton = this.videoMetadata.querySelector('.description-button');
        if (descriptionButton) {
            descriptionButton.addEventListener('click', (e) => {
                const description = e.target.closest('.description-button').dataset.description;
                this.openDescriptionOverlay(description);
            });
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
        descriptionContent.innerHTML = description;
        
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
        this.tagsContainer = document.querySelector('.tags-container');
        
        console.log('App: setupTagsPanel called');
        console.log('App: Tags panel found:', !!this.tagsPanel);
        console.log('App: Tags container found:', !!this.tagsContainer);
        
        // Remove all panel event listeners
        if (this.tagsContainer) {
            // No event listeners needed here anymore
            console.log('Tags panel initialized without direct interactions');
        } else {
            console.error('Tags container not found in setupTagsPanel');
        }
    }

    updateTagsPanel(node) {
        // Right panel tags panel is no longer used; tags are shown only in the bottom panel
        if (this.tagsPanel) {
            this.tagsPanel.classList.add('hidden');
        }
    }

    setupTailCategoriesPanel() {
        this.tailCategoriesPanel = document.querySelector('.tail-categories-panel');
        this.tailCategoriesContainer = document.querySelector('.tail-categories-container');
        
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
        if (!this.tailCategoriesPanel || !this.tailCategoriesContainer) {
            console.error('Tail categories panel not properly initialized');
            return;
        }

        this.tailCategoriesPanel.classList.remove('hidden');
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
            iframe.height = '315';
            iframe.src = `https://www.youtube.com/embed/${videoId}`;
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
            this.tagsContainer.insertBefore(tagElement, this.tagsContainer.firstChild);
            
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
        console.log('Tag hover triggered:', {
            element: tagElement,
            text: tagElement.textContent,
            isActive: tagElement.classList.contains('active'),
            container: this.tagsContainer,
            currentPosition: tagElement.getBoundingClientRect()
        });
        
        // Remove highlight from all tags first
        this.tagsContainer.querySelectorAll('.tag').forEach(el => {
            el.classList.remove('highlighted');
        });
        
        tagElement.classList.add('highlighted');
        
        // Only move if it's not already the first child
        const firstChild = this.tagsContainer.firstChild;
        if (firstChild !== tagElement) {
            console.log('Moving tag to top:', {
                tagToMove: tagElement.textContent,
                currentFirst: firstChild?.textContent
            });
            
            // Create a clone of the current order
            const currentOrder = Array.from(this.tagsContainer.children);
            
            // Remove the tag from its current position
            tagElement.remove();
            
            // Insert at the beginning
            this.tagsContainer.insertBefore(tagElement, this.tagsContainer.firstChild);
            
            console.log('New order:', Array.from(this.tagsContainer.children).map(el => el.textContent));
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
        const container = this.tagsContainer;
        
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
        if (!this.tagsContainer) return;

        const tagElement = this.tagsContainer.querySelector(
            `.tag[data-tag="${tagLabel}"]`
        );

        if (tagElement) {
            // Remove highlight from all tags
            this.tagsContainer.querySelectorAll('.tag')
                .forEach(el => el.classList.remove('highlighted'));
            
            // Add highlight to the hovered tag
            tagElement.classList.add('highlighted');
            
            // Move to top temporarily
            this.tagsContainer.insertBefore(tagElement, this.tagsContainer.firstChild);
        }
    }

    moveTagToTop(tagLabel) {
        if (!this.tagsContainer) return;

        const tagElement = this.tagsContainer.querySelector(
            `.tag[data-tag="${tagLabel}"]`
        );

        if (tagElement) {
            // Remove active state from all tags
            this.tagsContainer.querySelectorAll('.tag')
                .forEach(el => el.classList.remove('active'));
            
            // Add active state to clicked tag
            tagElement.classList.add('active');
            
            // Move to top
            this.tagsContainer.insertBefore(tagElement, this.tagsContainer.firstChild);
        }
    }

    setupBottomPanel() {
        this.bottomPanel = document.querySelector('.bottom-panel');
        this.bottomTagsContainer = document.getElementById('bottom-tags-container');
        this.bottomTagsList = document.getElementById('bottom-tags-list');
        this.bottomDefaultContent = document.getElementById('bottom-default-content');
        
        // Add click handler for tags in the bottom panel
        if (this.bottomTagsList) {
            this.bottomTagsList.addEventListener('click', (event) => {
                const tagElement = event.target.closest('.tag');
                if (tagElement) {
                    const tagLabel = tagElement.textContent.trim();
                    console.log('Tag clicked in bottom panel:', tagLabel);
                    this.showImagesForTag(tagLabel);
                }
            });
        }
    }

    showBottomTags(node) {
        console.log('showBottomTags: Called with node:', node);
        console.log('showBottomTags: Panel elements:', {
            bottomPanel: !!this.bottomPanel,
            bottomTagsContainer: !!this.bottomTagsContainer,
            bottomTagsList: !!this.bottomTagsList
        });
        
        if (!this.bottomPanel || !this.bottomTagsContainer || !this.bottomTagsList) {
            console.error('showBottomTags: Missing panel elements');
            return;
        }

        // Derive tags from raw video data by id
        const videoId = node?.id;
        const video = this.rawVideos?.find(v => v.id === videoId);
        const tags = video?.tags || [];

        if (!video || !tags.length) {
            console.warn('showBottomTags: No tags found for video id', videoId, 'video:', video);
        }

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

        // Clear the bottom panel (images)
        if (this.imageRepositories && this.imageRepositories.bottomPanel) {
            this.imageRepositories.bottomPanel.innerHTML = '<h3>Bottom Panel</h3><p>Static content for future use</p>';
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

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    window.app = app; // Make app instance globally available for fallback
    app.initialize();
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