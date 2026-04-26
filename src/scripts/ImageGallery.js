// Image Gallery Modal Class
export class ImageGallery {
    constructor() {
        this.modal = document.getElementById('image-gallery-modal');
        this.overlay = this.modal.querySelector('.gallery-overlay');
        this.closeBtn = document.getElementById('gallery-close');
        this.mainImage = document.getElementById('gallery-main-image');
        this.loading = document.getElementById('gallery-loading');
        this.prevBtn = document.getElementById('gallery-prev');
        this.nextBtn = document.getElementById('gallery-next');
        this.thumbnailsContainer = document.getElementById('gallery-thumbnails-container');
        this.currentSpan = document.getElementById('gallery-current');
        this.totalSpan = document.getElementById('gallery-total');
        this.titleElement = document.getElementById('gallery-image-title');
        this.artistElement = document.getElementById('gallery-image-artist');
        this.cultureElement = document.getElementById('gallery-image-culture');
        this.licenseElement = document.getElementById('gallery-image-license');
        this.sourceElement = document.getElementById('gallery-image-source');
        this.fullscreenBtn = document.getElementById('gallery-fullscreen');

        this.images = [];
        this.currentIndex = 0;
        this.isOpen = false;

        // Mapping of API source names to official institution names
        this.institutionNames = {
            'chicago': 'Art Institute of Chicago',
            'nypl': 'New York Public Library',
            'met': 'Metropolitan Museum of Art',
            'openverse': 'Openverse (Creative Commons)',
            'europeana': 'Europeana',
            'commons': 'Wikimedia Commons',
            'smithsonian': 'Smithsonian Institution',
            'cleveland': 'Cleveland Museum of Art',
            publication: 'Publication (project set)'
        };

        this.initializeEventListeners();
    }

    getInstitutionName(source) {
        return this.institutionNames[source] || source.toUpperCase();
    }

    initializeEventListeners() {
        // Close modal events
        this.closeBtn.addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', () => this.close());
        
        // Navigation events
        this.prevBtn.addEventListener('click', () => this.previousImage());
        this.nextBtn.addEventListener('click', () => this.nextImage());
        
        // Action buttons
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Prevent body scroll when modal is open
        this.modal.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    }

    open(images, startIndex = 0) {
        if (!images || images.length === 0) {
            console.error('No images provided to gallery');
            return;
        }

        this.images = images;
        this.currentIndex = startIndex;
        this.isOpen = true;

        // Show modal
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Focus modal for keyboard navigation
        this.modal.focus();

        // Initialize gallery
        this.updateCounter();
        this.updateThumbnails();
        this.loadCurrentImage();
        this.updateMetadata();
        this.updateNavigationButtons();
    }

    close() {
        this.isOpen = false;
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
        
        // Clear images to free memory
        this.images = [];
        this.currentIndex = 0;
    }

    loadCurrentImage() {
        if (this.images.length === 0) return;

        const currentImage = this.images[this.currentIndex];
        this.loading.style.display = 'flex';
        this.mainImage.style.opacity = '0';

        // Create new image to preload
        const img = new Image();
        img.onload = () => {
            this.mainImage.src = currentImage.fullUrl || currentImage.thumbnailUrl;
            this.mainImage.alt = currentImage.title;
            this.loading.style.display = 'none';
            this.mainImage.style.opacity = '1';
            this.updateThumbnails();
        };
        img.onerror = () => {
            console.error('Failed to load image:', currentImage.title);
            this.loading.style.display = 'none';
            this.mainImage.style.opacity = '1';
        };
        img.src = currentImage.fullUrl || currentImage.thumbnailUrl;
    }

    updateThumbnails() {
        this.thumbnailsContainer.innerHTML = '';
        
        this.images.forEach((image, index) => {
            const thumbnail = document.createElement('div');
            thumbnail.className = `gallery-thumbnail ${index === this.currentIndex ? 'active' : ''}`;
            
            const img = document.createElement('img');
            img.src = image.thumbnailUrl;
            img.alt = image.title;
            img.loading = 'lazy';
            
            thumbnail.appendChild(img);
            thumbnail.addEventListener('click', () => this.goToImage(index));
            
            this.thumbnailsContainer.appendChild(thumbnail);
        });
    }

    updateMetadata() {
        if (this.images.length === 0) return;

        const currentImage = this.images[this.currentIndex];
        
        this.titleElement.textContent = currentImage.title || 'Untitled';
        
        // Update metadata elements
        this.updateMetadataElement(this.artistElement, currentImage.artist, 'Artist');
        this.updateMetadataElement(this.cultureElement, currentImage.culture, 'Culture');
        this.updateMetadataElement(this.licenseElement, currentImage.license, 'License');
        this.updateMetadataElement(this.sourceElement, currentImage.source, 'Source');
    }

    updateMetadataElement(element, value, label) {
        if (value && value !== 'Unknown Artist' && value !== 'Unknown Culture' && value !== 'Unknown License') {
            // Special handling for source to use institution name
            if (label === 'Source') {
                element.textContent = `${label}: ${this.getInstitutionName(value)}`;
            } else {
                element.textContent = `${label}: ${value}`;
            }
            element.style.display = 'block';
        } else {
            element.style.display = 'none';
        }
    }

    updateCounter() {
        this.currentSpan.textContent = this.currentIndex + 1;
        this.totalSpan.textContent = this.images.length;
    }

    updateNavigationButtons() {
        this.prevBtn.style.display = this.images.length > 1 ? 'flex' : 'none';
        this.nextBtn.style.display = this.images.length > 1 ? 'flex' : 'none';
    }

    goToImage(index) {
        if (index < 0 || index >= this.images.length) return;
        
        this.currentIndex = index;
        this.loadCurrentImage();
        this.updateMetadata();
        this.updateCounter();
    }

    previousImage() {
        const newIndex = this.currentIndex > 0 ? this.currentIndex - 1 : this.images.length - 1;
        this.goToImage(newIndex);
    }

    nextImage() {
        const newIndex = this.currentIndex < this.images.length - 1 ? this.currentIndex + 1 : 0;
        this.goToImage(newIndex);
    }

    handleKeyboard(e) {
        if (!this.isOpen) return;

        switch (e.key) {
            case 'Escape':
                this.close();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.previousImage();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.nextImage();
                break;
            case ' ':
                e.preventDefault();
                this.nextImage();
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                this.toggleFullscreen();
                break;
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.modal.requestFullscreen().catch(err => {
                console.error('Error attempting to enable fullscreen:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }
}
