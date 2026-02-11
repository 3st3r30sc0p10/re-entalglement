// Image APIs Integration
import { ImageGallery } from './ImageGallery.js';

export class ImageRepositories {
    constructor() {
        console.log('ImageRepositories: Initializing...');
        this.chicagoApiUrl = 'https://api.artic.edu/api/v1';
        this.nyplApiUrl = 'https://api.repo.nypl.org/api/v2';
        this.nyplToken = 'zdx9mfhnl5jbvlh8';
        this.metApiUrl = 'https://collectionapi.metmuseum.org/public/collection/v1';
        this.openverseApiUrl = 'https://api.openverse.engineering/v1';
        this.rijksApiUrl = 'https://data.rijksmuseum.nl/object-metadata/api';
        this.rijksApiKey = '4H77aGm4';
        this.proxyUrl = 'http://localhost:3001/proxy';
        this.bottomPanel = document.querySelector('.bottom-panel');
        this.gallery = new ImageGallery();
        this.currentImages = []; // Store current images for gallery
        this.loader = null; // Bottom panel loading overlay controller
        
        // Mapping of API source names to official institution names
        this.institutionNames = {
            'chicago': 'Art Institute of Chicago',
            'nypl': 'New York Public Library',
            'met': 'Metropolitan Museum of Art',
            'openverse': 'Openverse (Creative Commons)',
            'rijksmuseum': 'Rijksmuseum',
            'europeana': 'Europeana',
            'commons': 'Wikimedia Commons',
            'smithsonian': 'Smithsonian Institution'
        };
        
        console.log('ImageRepositories: Bottom panel found:', !!this.bottomPanel);
    }

    getInstitutionName(source) {
        return this.institutionNames[source] || source.toUpperCase();
    }

    async searchImages(searchTerm) {
        try {
            console.log('searchImages: Starting search for term:', searchTerm);
            
            // Clear previous results
            this.clearBottomPanel();
            
            // Show loading state
            this.showLoading();
            // Start with initial progress
            this.updateLoadingProgress(10, 'Searching repositories...');

            // Fetch from all APIs concurrently
            const [chicagoImages, nyplImages, metImages, openverseImages, rijksImages, europeanaImages, commonsImages, smithsonianImages] = await Promise.all([
                this.fetchChicagoArt(searchTerm),
                this.fetchNYPLImages(searchTerm),
                this.fetchMetArt(searchTerm),
                this.fetchOpenverseImages(searchTerm),
                this.fetchRijksArt(searchTerm),
                this.fetchEuropeanaImages(searchTerm),
                this.fetchCommonsImages(searchTerm),
                this.fetchSmithsonianImages(searchTerm)
            ]);

            // Log results from each API
            console.log('\n=== Image Search Results ===');
            console.log('Chicago API:', chicagoImages.length, 'images');
            chicagoImages.forEach(img => console.log(`- ${img.title} (Chicago)`));
            
            console.log('\nNYPL API:', nyplImages.length, 'images');
            nyplImages.forEach(img => console.log(`- ${img.title} (NYPL)`));
            
            console.log('\nMET API:', metImages.length, 'images');
            metImages.forEach(img => console.log(`- ${img.title} (MET)`));

            console.log('\nOpenverse API:', openverseImages.length, 'images');
            openverseImages.forEach(img => console.log(`- ${img.title} (Openverse)`));

            console.log('\nRijksmuseum API:', rijksImages.length, 'images');
            rijksImages.forEach(img => console.log(`- ${img.title} (Rijksmuseum)`));

            console.log('\nEuropeana API:', europeanaImages.length, 'images');
            europeanaImages.forEach(img => console.log(`- ${img.title} (Europeana)`));

            console.log('\nCommons API:', commonsImages.length, 'images');
            commonsImages.forEach(img => console.log(`- ${img.title} (Commons)`));

            console.log('\nSmithsonian API:', smithsonianImages.length, 'images');
            smithsonianImages.forEach(img => console.log(`- ${img.title} (Smithsonian)`));

            // Combine all results
            const allImages = [...chicagoImages, ...nyplImages, ...metImages, ...openverseImages, ...rijksImages, ...europeanaImages, ...commonsImages, ...smithsonianImages];
            console.log('\nTotal images found:', allImages.length);

            if (allImages.length > 0) {
                // Mark fetch phase complete
                this.updateLoadingProgress(50, 'Validating images...');
                await this.displayImages(allImages);
            } else {
                this.hideLoading();
                this.bottomPanel.innerHTML = '<p>No images found for this search term.</p>';
            }
        } catch (error) {
            console.error('Error in searchImages:', error);
            this.showError();
        }
    }

    async fetchChicagoArt(searchTerm) {
        console.log('\n=== Chicago API Search ===');
        console.log('fetchChicagoArt: Starting fetch for term:', searchTerm);
        try {
            const url = `${this.chicagoApiUrl}/artworks/search?q=${encodeURIComponent(searchTerm)}&limit=10&fields=id,title,image_id,is_public_domain`;
            console.log('fetchChicagoArt: Fetching from URL:', url);

            const response = await fetch(url);
            console.log('fetchChicagoArt: Response received:', response.status);

            const { data } = await response.json();
            console.log('fetchChicagoArt: Raw data received:', data);

            const filteredResults = data
                .filter(artwork => artwork.is_public_domain && artwork.image_id)
                .map(artwork => ({
                    source: 'chicago',
                    title: artwork.title,
                    thumbnailUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/400,/0/default.jpg`,
                    fullUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/843,/0/default.jpg`
                }));

            console.log('fetchChicagoArt: Filtered results:', filteredResults.length);
            return filteredResults;
        } catch (error) {
            console.error('Error in fetchChicagoArt:', error);
            return [];
        }
    }

    async fetchNYPLImages(searchTerm) {
        console.log('\n=== NYPL API Search ===');
        console.log('fetchNYPLImages: Starting fetch for term:', searchTerm);
        try {
            const url = `${this.proxyUrl}/nypl?q=${encodeURIComponent(searchTerm)}`;
            console.log('fetchNYPLImages: Fetching from URL:', url);

            const response = await fetch(url);
            
            if (!response.ok) {
                console.log('fetchNYPLImages: NYPL API request failed with status:', response.status);
                const errorText = await response.text();
                console.log('fetchNYPLImages: Error response:', errorText);
                return [];
            }

            const data = await response.json();
            console.log('fetchNYPLImages: Raw data received:', data);

            if (!data || !data.nyplAPI || !data.nyplAPI.response || !data.nyplAPI.response.result) {
                console.log('fetchNYPLImages: No valid results in response');
                return [];
            }

            const results = data.nyplAPI.response.result
                .filter(item => item.imageID)
                .map(item => ({
                    source: 'nypl',
                    title: item.title || 'Untitled',
                    thumbnailUrl: `https://images.nypl.org/index.php?id=${item.imageID}&t=r`,
                    fullUrl: `https://images.nypl.org/index.php?id=${item.imageID}&t=w`
                }));

            console.log('fetchNYPLImages: Processed results:', results.length);
            return results;
        } catch (error) {
            console.error('Error in fetchNYPLImages:', error);
            if (error.message) {
                console.error('Error message:', error.message);
            }
            return [];
        }
    }

    async fetchMetArt(searchTerm) {
        console.log('\n=== MET API Search ===');
        console.log('fetchMetArt: Starting fetch for term:', searchTerm);
        try {
            const searchUrl = `${this.metApiUrl}/search?q=${encodeURIComponent(searchTerm)}`;
            console.log('fetchMetArt: Fetching from URL:', searchUrl);

            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();

            if (!searchData.objectIDs || searchData.objectIDs.length === 0) {
                console.log('fetchMetArt: No results found');
                return [];
            }

            console.log('fetchMetArt: Found', searchData.objectIDs.length, 'potential matches');

            const objectIds = searchData.objectIDs.slice(0, 5);
            const results = [];

            for (const objectId of objectIds) {
                const objectUrl = `${this.metApiUrl}/objects/${objectId}`;
                const objectResponse = await fetch(objectUrl);
                const objectData = await objectResponse.json();

                if (objectData.primaryImage) {
                    results.push({
                        source: 'met',
                        title: objectData.title || 'Untitled',
                        thumbnailUrl: objectData.primaryImage,
                        fullUrl: objectData.primaryImage,
                        artist: objectData.artistDisplayName || 'Unknown Artist',
                        culture: objectData.culture || 'Unknown Culture'
                    });
                    console.log(`fetchMetArt: Retrieved artwork "${objectData.title}" (ID: ${objectId})`);
                }
            }

            console.log('fetchMetArt: Processed results:', results.length);
            return results;
        } catch (error) {
            console.error('Error in fetchMetArt:', error);
            return [];
        }
    }

    async fetchOpenverseImages(searchTerm) {
        console.log('\n=== Openverse API Search ===');
        console.log('fetchOpenverseImages: Starting fetch for term:', searchTerm);
        try {
            const url = `${this.proxyUrl}/openverse?q=${encodeURIComponent(searchTerm)}`;
            console.log('fetchOpenverseImages: Fetching from URL:', url);

            const response = await fetch(url);
            console.log('fetchOpenverseImages: Response status:', response.status);

            if (!response.ok) {
                console.error('Openverse API Error:', response.status);
                const errorText = await response.text();
                console.error('Openverse API Error Details:', errorText);
                return [];
            }

            const data = await response.json();
            console.log('fetchOpenverseImages: Raw API response:', data);
            
            if (!data.results) {
                console.log('fetchOpenverseImages: No results found in response');
                console.log('fetchOpenverseImages: Response structure:', Object.keys(data));
                return [];
            }

            console.log('fetchOpenverseImages: Number of results found:', data.results.length);
            
            // Process and deduplicate results
            const processedResults = new Map();
            const seenCreators = new Set();
            
            data.results.forEach(image => {
                // Skip if we've seen too many images from the same creator
                if (seenCreators.has(image.creator) && seenCreators.size > 5) {
                    return;
                }
                seenCreators.add(image.creator);
                
                // Enhanced title cleaning
                let cleanTitle = image.title || 'Untitled';
                // Remove URLs
                cleanTitle = cleanTitle.replace(/https?:\/\/[^\s]+/g, '');
                // Remove common phrases
                cleanTitle = cleanTitle.replace(/Image Picture Photography/g, '');
                cleanTitle = cleanTitle.replace(/Picture Image Photography/g, '');
                // Remove country names and locations
                cleanTitle = cleanTitle.replace(/\b(Spain|Espagne|Navarra|France|Germany|Italy|UK|USA)\b/g, '');
                // Remove GTRO RACING and similar phrases
                cleanTitle = cleanTitle.replace(/GTRO RACING/g, '');
                // Remove circuit names
                cleanTitle = cleanTitle.replace(/Circuit Los Arcos/g, '');
                // Remove extra spaces and dashes
                cleanTitle = cleanTitle.replace(/\s*-\s*/g, ' ');
                cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();
                // Remove trailing dashes and spaces
                cleanTitle = cleanTitle.replace(/[- ]+$/, '');
                // Remove duplicate words
                cleanTitle = cleanTitle.replace(/\b(\w+)\s+\1\b/g, '$1');
                // Remove common prefixes
                cleanTitle = cleanTitle.replace(/^(Formule Renault|Horse racing|Race)\s+/i, '');
                
                // Skip if we already have this title
                if (processedResults.has(cleanTitle)) {
                    return;
                }
                
                console.log('Processing image:', {
                    title: cleanTitle,
                    hasThumbnail: !!image.thumbnail,
                    hasUrl: !!image.url,
                    creator: image.creator,
                    license: image.license
                });
                
                processedResults.set(cleanTitle, {
                    source: 'openverse',
                    title: cleanTitle,
                    thumbnailUrl: image.thumbnail || image.url,
                    fullUrl: image.url,
                    artist: image.creator || 'Unknown Artist',
                    license: image.license || 'Unknown License'
                });
            });

            const results = Array.from(processedResults.values()).slice(0, 10);
            console.log('fetchOpenverseImages: Processed results:', results.length);
            return results;
        } catch (error) {
            console.error('Error in fetchOpenverseImages:', error);
            console.error('Error stack:', error.stack);
            return [];
        }
    }

    async fetchRijksArt(searchTerm) {
        console.log('\n=== Rijksmuseum API Search ===');
        console.log('fetchRijksArt: Starting fetch for term:', searchTerm);
        try {
            const url = `${this.proxyUrl}/rijksmuseum?q=${encodeURIComponent(searchTerm)}`;
            console.log('fetchRijksArt: Fetching from URL:', url);

            const response = await fetch(url);

            if (!response.ok) {
                console.log('fetchRijksArt: API request failed with status:', response.status);
                const errorText = await response.text();
                console.log('fetchRijksArt: Error response:', errorText);
                return [];
            }

            const data = await response.json();
            console.log('fetchRijksArt: Raw data received:', data);

            if (!Array.isArray(data) || data.length === 0) {
                console.log('fetchRijksArt: No results found');
                return [];
            }

            // Process and filter results
            const results = data
                .filter(artwork => artwork.webImage && artwork.webImage.url)
                .slice(0, 10) // Limit to 10 results
                .map(artwork => ({
                    source: 'rijksmuseum',
                    title: artwork.title || 'Untitled',
                    thumbnailUrl: artwork.webImage.url.replace('=s0', '=s400'),
                    fullUrl: artwork.webImage.url,
                    artist: artwork.principalOrFirstMaker || 'Unknown Artist',
                    culture: artwork.objectTypes?.[0] || 'Unknown Type'
                }));

            console.log('fetchRijksArt: Processed results:', results.length);
            return results;
        } catch (error) {
            console.error('Error in fetchRijksArt:', error);
            if (error.message) {
                console.error('Error message:', error.message);
            }
            return [];
        }
    }

    async fetchEuropeanaImages(searchTerm) {
        console.log('\n=== Europeana API Search ===');
        console.log('fetchEuropeanaImages: Starting fetch for term:', searchTerm);
        try {
            const url = `${this.proxyUrl}/europeana?q=${encodeURIComponent(searchTerm)}`;
            console.log('fetchEuropeanaImages: Fetching from URL:', url);

            const response = await fetch(url);
            console.log('fetchEuropeanaImages: Response status:', response.status);

            if (!response.ok) {
                console.error('Europeana API Error:', response.status);
                const errorText = await response.text();
                console.error('Europeana API Error Details:', errorText);
                return [];
            }

            const data = await response.json();
            console.log('fetchEuropeanaImages: Raw API response:', data);
            
            if (!data.items || !Array.isArray(data.items)) {
                console.log('fetchEuropeanaImages: No results found in response');
                return [];
            }

            console.log('fetchEuropeanaImages: Number of results found:', data.items.length);
            
            // Process and filter results
            const results = data.items
                .filter(item => item.edmPreview && item.edmPreview[0])
                .map(item => ({
                    source: 'europeana',
                    title: item.title?.[0] || 'Untitled',
                    thumbnailUrl: item.edmPreview[0],
                    fullUrl: item.edmPreview[0].replace('/preview/', '/full/'),
                    artist: item.creator?.[0] || 'Unknown Artist',
                    culture: item.dataProvider?.[0] || 'Unknown Provider',
                    license: item.rights?.[0] || 'Unknown License'
                }));

            console.log('fetchEuropeanaImages: Processed results:', results.length);
            return results;
        } catch (error) {
            console.error('Error in fetchEuropeanaImages:', error);
            console.error('Error stack:', error.stack);
            return [];
        }
    }

    async fetchCommonsImages(searchTerm) {
        console.log('\n=== Commons API Search ===');
        console.log('fetchCommonsImages: Starting fetch for term:', searchTerm);
        try {
            const url = `${this.proxyUrl}/commons?q=${encodeURIComponent(searchTerm)}`;
            console.log('fetchCommonsImages: Fetching from URL:', url);

            const response = await fetch(url);
            console.log('fetchCommonsImages: Response status:', response.status);

            if (!response.ok) {
                console.error('Commons API Error:', response.status);
                const errorText = await response.text();
                console.error('Commons API Error Details:', errorText);
                return [];
            }

            const data = await response.json();
            console.log('fetchCommonsImages: Raw API response:', data);
            
            if (!data.query?.pages) {
                console.log('fetchCommonsImages: No results found in response');
                return [];
            }

            // Process and filter results
            const results = Object.values(data.query.pages)
                .filter(item => item.imageinfo && item.imageinfo[0])
                .map(item => {
                    const imageInfo = item.imageinfo[0];
                    const metadata = imageInfo.extmetadata || {};
                    
                    // Construct thumbnail URL by replacing the full URL with a thumbnail version
                    const fullUrl = imageInfo.url;
                    const thumbnailUrl = fullUrl.replace(/\/commons\//, '/commons/thumb/') + '/300px-' + item.title.replace('File:', '');
                    
                    return {
                        source: 'commons',
                        title: item.title.replace('File:', '').replace(/\.[^/.]+$/, ''),
                        thumbnailUrl: thumbnailUrl,
                        fullUrl: fullUrl,
                        artist: metadata.Artist?.value || 'Unknown Artist',
                        license: metadata.LicenseShortName?.value || 'Unknown License',
                        culture: metadata.Categories?.value?.split('|')[0] || 'Unknown Category'
                    };
                });

            console.log('fetchCommonsImages: Processed results:', results.length);
            return results;
        } catch (error) {
            console.error('Error in fetchCommonsImages:', error);
            console.error('Error stack:', error.stack);
            return [];
        }
    }

    async fetchSmithsonianImages(searchTerm) {
        console.log('\n=== Smithsonian API Search ===');
        console.log('fetchSmithsonianImages: Starting fetch for term:', searchTerm);
        try {
            const url = `${this.proxyUrl}/smithsonian?q=${encodeURIComponent(searchTerm)}`;
            console.log('fetchSmithsonianImages: Fetching from URL:', url);

            const response = await fetch(url);
            console.log('fetchSmithsonianImages: Response status:', response.status);

            if (!response.ok) {
                console.error('Smithsonian API Error:', response.status);
                const errorText = await response.text();
                console.error('Smithsonian API Error Details:', errorText);
                return [];
            }

            const data = await response.json();
            console.log('fetchSmithsonianImages: Raw API response:', data);
            
            if (!data.response?.rows) {
                console.log('fetchSmithsonianImages: No results found in response');
                return [];
            }

            console.log('fetchSmithsonianImages: Number of results found:', data.response.rows.length);
            
            // Process and filter results
            const results = data.response.rows
                .filter(item => item.online_media?.media?.length > 0)
                .map(item => {
                    const media = item.online_media.media[0];
                    return {
                        source: 'smithsonian',
                        title: item.title || 'Untitled',
                        thumbnailUrl: media.content,
                        fullUrl: media.content,
                        artist: item.artist || 'Unknown Artist',
                        culture: item.culture || 'Unknown Culture',
                        license: 'CC0' // Smithsonian Open Access is CC0
                    };
                });

            console.log('fetchSmithsonianImages: Processed results:', results.length);
            return results;
        } catch (error) {
            console.error('Error in fetchSmithsonianImages:', error);
            console.error('Error stack:', error.stack);
            return [];
        }
    }

    clearBottomPanel() {
        console.log('clearBottomPanel: Clearing panel');
        if (this.bottomPanel) {
            this.bottomPanel.innerHTML = '';
            // Reset loader reference since DOM was cleared
            this.loader = null;
        } else {
            console.error('clearBottomPanel: Bottom panel not found');
        }
    }

    showLoading() {
        console.log('showLoading: Showing loading state');
        if (this.bottomPanel) {
            // Always create a fresh overlay to ensure it's properly attached to DOM
            this.loader = this.createLoadingOverlay();
            this.loader.root.classList.add('visible');
            this.loader.start();
        } else {
            console.error('showLoading: Bottom panel not found');
        }
    }

    showError() {
        console.log('showError: Showing error state');
        if (this.bottomPanel) {
            this.hideLoading();
            this.bottomPanel.innerHTML = '<p>Error loading images. Please try again.</p>';
        } else {
            console.error('showError: Bottom panel not found');
        }
    }

    hideLoading() {
        if (this.loader) {
            this.loader.stop();
            this.loader.root.classList.remove('visible');
        }
    }

    updateLoadingProgress(percent, text) {
        if (this.loader) {
            this.loader.setProgress(percent);
            if (text) this.loader.setText(text);
        }
    }

    createLoadingOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'bottom-loading-overlay';
        overlay.innerHTML = `
            <div class="bottom-loading-content">
                <canvas class="bottom-loading-canvas" width="200" height="200"></canvas>
                <div class="bottom-loading-text" data-role="text">Loading images...</div>
                <div class="bottom-loading-subtext" data-role="subtext">This may take a few seconds</div>
            </div>
        `;
        this.bottomPanel.appendChild(overlay);

        const canvas = overlay.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        let rafId = null;
        let progress = 0; // 0..100
        let t = 0; // time for wave

        const draw = () => {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // Palette from CSS variables with fallbacks
            const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--color-background') || '#ffffff';
            const ringColor = getComputedStyle(document.documentElement).getPropertyValue('--color-foreground') || '#fafafa';
            const wave1 = getComputedStyle(document.documentElement).getPropertyValue('--color-primary') || '#3b82f6';
            const wave2 = getComputedStyle(document.documentElement).getPropertyValue('--color-secondary') || '#8b5cf6';
            const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-dark') || '#17212f';

            const cx = w / 2;
            const cy = h / 2;
            const radius = Math.min(w, h) * 0.38;

            // Background circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 16, 0, Math.PI * 2);
            ctx.strokeStyle = ringColor.trim() || '#fafafa';
            ctx.lineWidth = 10;
            ctx.stroke();
            ctx.restore();

            // Clip to inner circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.clip();

            // Compute fluid height based on progress
            const fillRatio = Math.max(0, Math.min(progress / 100, 1));
            const baseY = cy + radius - (2 * radius * fillRatio);

            // Animate two sine waves
            t += 0.02;
            const drawWave = (amplitude, wavelength, speed, color, phase) => {
                ctx.beginPath();
                ctx.moveTo(0, h);
                for (let x = 0; x <= w; x++) {
                    const y = baseY + amplitude * Math.sin((x / wavelength) + (t * speed) + phase);
                    ctx.lineTo(x, y);
                }
                ctx.lineTo(w, h);
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
            };

            drawWave(6, 24, 1.2, (wave2.trim() || '#8b5cf6'), 0);
            drawWave(9, 32, 0.9, (wave1.trim() || '#3b82f6'), Math.PI / 2);

            ctx.restore();

            // Percentage text
            ctx.save();
            ctx.fillStyle = textColor.trim() || '#17212f';
            ctx.font = '700 32px "Host Grotesk", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${Math.round(progress)}%`, cx, cy);
            ctx.restore();

            rafId = requestAnimationFrame(draw);
        };

        const start = () => {
            if (!rafId) rafId = requestAnimationFrame(draw);
        };
        const stop = () => {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        };
        const setProgress = (p) => {
            progress = Math.max(0, Math.min(100, p));
        };
        const setText = (txt) => {
            const el = overlay.querySelector('[data-role="text"]');
            if (el) el.textContent = txt;
        };

        return { root: overlay, canvas, start, stop, setProgress, setText };
    }

    async validateImageUrl(url) {
        // Basic URL validation
        if (!url || typeof url !== 'string' || url.trim() === '') {
            return false;
        }

        // Check for common broken URL patterns
        const brokenPatterns = [
            /placeholder/i,
            /broken/i,
            /error/i,
            /not-found/i,
            /404/i,
            /no-image/i,
            /default\.(jpg|png|gif)/i,
            /\.svg$/i, // Skip SVG files as they might not load properly
        ];

        if (brokenPatterns.some(pattern => pattern.test(url))) {
            return false;
        }

        return new Promise((resolve) => {
            const img = new Image();
            const timeout = setTimeout(() => {
                resolve(false);
            }, 5000); // 5 second timeout

            img.onload = () => {
                clearTimeout(timeout);
                // Additional check: ensure the image has actual dimensions
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            };

            img.onerror = () => {
                clearTimeout(timeout);
                resolve(false);
            };

            img.src = url;
        });
    }

    async filterValidImages(images) {
        console.log('filterValidImages: Starting validation for', images.length, 'images');
        const validImages = [];
        
        // Process images in batches to avoid overwhelming the browser
        const batchSize = 5;
        for (let i = 0; i < images.length; i += batchSize) {
            const batch = images.slice(i, i + batchSize);
            
            // Update progress indicator
            const progress = Math.round(((i + batch.length) / images.length) * 100);
            this.updateLoadingProgress(50 + Math.round(progress * 0.5), `Validating images... ${progress}%`);
            
            const batchPromises = batch.map(async (image) => {
                const isValid = await this.validateImageUrl(image.thumbnailUrl);
                if (isValid) {
                    console.log('✓ Valid image:', image.title, 'from', image.source);
                    return image;
                } else {
                    console.log('✗ Invalid image:', image.title, 'from', image.source);
                    return null;
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            validImages.push(...batchResults.filter(img => img !== null));
        }
        
        console.log('filterValidImages: Found', validImages.length, 'valid images out of', images.length);
        return validImages;
    }

    async displayImages(images) {
        console.log('displayImages: Starting to display images:', images.length);
        if (!this.bottomPanel) {
            console.error('displayImages: Bottom panel not found');
            return;
        }

        if (!images.length) {
            console.log('displayImages: No images to display');
            this.bottomPanel.innerHTML = '<p>No images found.</p>';
            return;
        }

        // Ensure overlay is visible during validation phase
        if (!this.loader) {
            this.showLoading();
        }
        this.loader.root.classList.add('visible');
        this.loader.start();
        this.updateLoadingProgress(55, 'Validating images...');

        // Filter out broken image links
        const validImages = await this.filterValidImages(images);

        if (!validImages.length) {
            console.log('displayImages: No valid images found after filtering');
            this.hideLoading();
            this.bottomPanel.innerHTML = '<p>No valid images found for this search term.</p>';
            this.currentImages = [];
            return;
        }

        // Store current images for gallery
        this.currentImages = validImages;

        const galleryHTML = `
            <div class="image-gallery-header">
                <button class="back-to-tags-btn" id="back-to-tags-btn">
                    <span class="button-icon">←</span>
                    <span class="button-text">Back to Tags</span>
                </button>
                <div class="image-count-display">
                    <div class="image-count-label"># Images:</div>
                    <div class="image-count-number">${validImages.length}</div>
                </div>
            </div>
            <div class="image-gallery">
                ${validImages.map(image => `
                    <div class="image-thumbnail" data-source="${image.source}">
                        <img src="${image.thumbnailUrl}" 
                             alt="${image.title}"
                             title="${image.title}"
                             data-full-url="${image.fullUrl}"
                             loading="lazy">
                        <div class="image-info">
                            <div class="image-title">${image.title}</div>
                            ${image.artist ? `<div class="image-artist">${image.artist}</div>` : ''}
                            ${image.culture ? `<div class="image-culture">${image.culture}</div>` : ''}
                            ${image.license ? `<div class="image-license">License: ${image.license}</div>` : ''}
                            <div class="image-source">Source: ${this.getInstitutionName(image.source)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        console.log('displayImages: Setting gallery HTML');
        this.hideLoading();
        this.bottomPanel.innerHTML = galleryHTML;

        // Add click handler for back to tags button
        const backToTagsBtn = this.bottomPanel.querySelector('#back-to-tags-btn');
        console.log('displayImages: Back to tags button found:', !!backToTagsBtn);
        if (backToTagsBtn) {
            // Remove any existing event listeners to prevent duplicates
            const newBtn = backToTagsBtn.cloneNode(true);
            backToTagsBtn.parentNode.replaceChild(newBtn, backToTagsBtn);
            
            // Add fresh event listener
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Back to tags button clicked');
                try {
                    this.returnToTags();
                } catch (error) {
                    console.error('Error in returnToTags:', error);
                }
            });
            console.log('displayImages: Back to tags button event listener attached');
        } else {
            console.error('displayImages: Back to tags button not found!');
        }

        // Add click handlers for thumbnails and error handling
        console.log('displayImages: Adding click handlers and error handling');
        this.bottomPanel.querySelectorAll('.image-thumbnail').forEach((thumb, index) => {
            const img = thumb.querySelector('img');
            
            // Add click handler to open gallery
            thumb.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Opening gallery for image:', index);
                this.gallery.open(this.currentImages, index);
            });
            
            // Add error handling for images that might fail to load after validation
            img.addEventListener('error', () => {
                console.log('Image failed to load after validation:', img.src);
                thumb.style.display = 'none'; // Hide broken images
            });
            
            // Add load handler for lazy loading
            img.addEventListener('load', () => {
                img.classList.add('loaded');
            });
        });
    }

    returnToTags() {
        console.log('returnToTags: Returning to tag list');
        try {
            // Dispatch a custom event to notify the main app to show tags again
            const returnToTagsEvent = new CustomEvent('returnToTags', {
                bubbles: true,
                cancelable: true
            });
            console.log('returnToTags: Dispatching returnToTags event');
            document.dispatchEvent(returnToTagsEvent);
            
            // Fallback: Try to access the main app instance directly
            setTimeout(() => {
                if (window.app && window.app.showBottomTags && window.app.selectedNode) {
                    console.log('returnToTags: Using fallback method');
                    window.app.showBottomTags(window.app.selectedNode);
                }
            }, 100);
        } catch (error) {
            console.error('returnToTags: Error dispatching event:', error);
        }
    }
} 