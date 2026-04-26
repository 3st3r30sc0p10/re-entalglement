// Image APIs Integration
import { ImageGallery } from './ImageGallery.js';
import { createBottomLoadingOverlay } from './bottomLoadingOverlay.js';
import goBackIcon from '../images/go-back.png';

/**
 * Base URL for API proxy (NYPL, publication, etc.).
 * Use same origin when the dev server proxies `/proxy` → Express so publication fetch + images work from :3000.
 */
function getImageProxyBase() {
    if (typeof window === 'undefined') return 'http://127.0.0.1:3001/proxy';
    const { origin, protocol } = window.location;
    if (protocol === 'file:' || !origin) return 'http://127.0.0.1:3001/proxy';
    return `${origin}/proxy`;
}

/** Escape text for safe HTML interpolation in templates. */
function escHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escAttr(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Public names + documentation URLs shown while loading and after results (image panel). */
const SEARCH_SOURCE_CATALOG = [
    {
        key: 'publication',
        name: 'Publication (project set)',
        url: 'https://fhi.duke.edu',
    },
    {
        key: 'chicago',
        name: 'Art Institute of Chicago API',
        url: 'https://api.artic.edu/docs/',
    },
    {
        key: 'nypl',
        name: 'New York Public Library Digital Collections API',
        url: 'https://api.repo.nypl.org/',
    },
    {
        key: 'met',
        name: 'The Met Collection API',
        url: 'https://metmuseum.github.io/',
    },
    {
        key: 'openverse',
        name: 'Openverse API',
        url: 'https://openverse.org/docs/api_reference/index.html',
    },
    {
        key: 'europeana',
        name: 'Europeana APIs',
        url: 'https://pro.europeana.eu/page/apis',
    },
    {
        key: 'commons',
        name: 'Wikimedia Commons API',
        url: 'https://commons.wikimedia.org/wiki/Commons:API',
    },
    {
        key: 'smithsonian',
        name: 'Smithsonian Open Access',
        url: 'https://www.si.edu/openaccess/devtools',
    },
    {
        key: 'cleveland',
        name: 'Cleveland Museum of Art Open Access API',
        url: 'https://openaccess-api.clevelandart.org/',
    },
];

export class ImageRepositories {
    constructor() {
        console.log('ImageRepositories: Initializing...');
        this.chicagoApiUrl = 'https://api.artic.edu/api/v1';
        this.nyplApiUrl = 'https://api.repo.nypl.org/api/v2';
        this.nyplToken = 'zdx9mfhnl5jbvlh8';
        this.metApiUrl = 'https://collectionapi.metmuseum.org/public/collection/v1';
        this.openverseApiUrl = 'https://api.openverse.engineering/v1';
        this.proxyUrl = getImageProxyBase();
        this.bottomPanel =
            document.querySelector('#panel-tags-body') || document.querySelector('.bottom-panel');
        this.gallery = new ImageGallery();
        this.currentImages = []; // Store current images for gallery
        this.loader = null; // Bottom panel loading overlay controller
        /** @type {string | null} Last normalized tag string used for image search (panel header). */
        this.lastSearchTag = null;

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
        
        console.log('ImageRepositories: Bottom panel found:', !!this.bottomPanel);
    }

    /** Keep touch gestures on panel scroll areas from bubbling into graph interactions. */
    _setupTouchScrollIsolation() {
        if (!this.bottomPanel) return;
        const isolate = (event) => {
            event.stopPropagation();
        };
        const targets = [
            '.image-gallery',
            '.image-gallery-api-list',
            '.image-gallery-toolbar'
        ];
        targets.forEach((selector) => {
            const el = this.bottomPanel.querySelector(selector);
            if (!el || el.dataset.touchScrollIsolated === '1') return;
            el.addEventListener('touchstart', isolate, { passive: true });
            el.addEventListener('touchmove', isolate, { passive: true });
            el.dataset.touchScrollIsolated = '1';
        });
    }

    getInstitutionName(source) {
        return this.institutionNames[source] || source.toUpperCase();
    }

    /** @returns {ReadonlyArray<{ key: string; name: string; url: string }>} */
    getSearchSourceCatalog() {
        return SEARCH_SOURCE_CATALOG;
    }

    /** @param {string} key */
    getSourcePublicMeta(key) {
        const row = SEARCH_SOURCE_CATALOG.find((s) => s.key === key);
        if (row) return { ...row };
        return {
            key,
            name: this.getInstitutionName(key),
            url: '',
        };
    }

    /**
     * Notify the tags slide header with the tag and human-readable source names
     * (after results or when the search finishes with no usable images).
     * @param {string} tag
     * @param {string[]} sourceNames
     */
    _emitTagsPanelImagesMeta(tag, sourceNames) {
        const names = Array.isArray(sourceNames)
            ? [...new Set(sourceNames.map((n) => String(n)))].filter(Boolean)
            : [];
        document.dispatchEvent(
            new CustomEvent('tagsPanelImagesMeta', {
                bubbles: true,
                detail: { tag: String(tag ?? '').trim(), sourceNames: names },
            })
        );
    }

    async searchImages(searchTerm) {
        try {
            const q = String(searchTerm ?? '')
                .normalize('NFKC')
                .replace(/\u00a0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            this.lastSearchTag = q;
            console.log('searchImages: Starting search for term:', q);

            // Clear previous results
            this.clearBottomPanel();
            
            // Show loading state
            this.showLoading();
            // Start with initial progress
            this.updateLoadingProgress(10, 'Searching repositories...');

            // Fetch from publication set + all APIs concurrently
            const [
                publicationImages,
                chicagoImages,
                nyplImages,
                metImages,
                openverseImages,
                europeanaImages,
                commonsImages,
                smithsonianImages,
                clevelandImages
            ] = await Promise.all([
                this.fetchPublicationImages(q),
                this.fetchChicagoArt(q),
                this.fetchNYPLImages(q),
                this.fetchMetArt(q),
                this.fetchOpenverseImages(q),
                this.fetchEuropeanaImages(q),
                this.fetchCommonsImages(q),
                this.fetchSmithsonianImages(q),
                this.fetchClevelandImages(q)
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

            console.log('\nEuropeana API:', europeanaImages.length, 'images');
            europeanaImages.forEach(img => console.log(`- ${img.title} (Europeana)`));

            console.log('\nCommons API:', commonsImages.length, 'images');
            commonsImages.forEach(img => console.log(`- ${img.title} (Commons)`));

            console.log('\nSmithsonian API:', smithsonianImages.length, 'images');
            smithsonianImages.forEach(img => console.log(`- ${img.title} (Smithsonian)`));

            console.log('\nCleveland Museum of Art API:', clevelandImages.length, 'images');
            clevelandImages.forEach(img => console.log(`- ${img.title} (Cleveland)`));

            console.log('\nPublication (local):', publicationImages.length, 'images');
            publicationImages.forEach(img => console.log(`- ${img.title} (Publication)`));

            // Combine: project publication images first, then API results
            const allImages = [
                ...publicationImages,
                ...chicagoImages,
                ...nyplImages,
                ...metImages,
                ...openverseImages,
                ...europeanaImages,
                ...commonsImages,
                ...smithsonianImages,
                ...clevelandImages
            ];
            console.log('\nTotal images found:', allImages.length);

            if (allImages.length > 0) {
                // Mark fetch phase complete
                this.updateLoadingProgress(50, 'Validating images...');
                await this.displayImages(allImages, q);
            } else {
                this.hideLoading();
                this.bottomPanel.innerHTML = '<p>No images found for this search term.</p>';
                this._emitTagsPanelImagesMeta(q, []);
            }
        } catch (error) {
            console.error('Error in searchImages:', error);
            this.showError();
        }
    }

    /**
     * Keyword-matched images from src/images-publication (spreadsheet + files), via proxy server.
     */
    async fetchPublicationImages(searchTerm) {
        try {
            const url = `${this.proxyUrl}/publication?q=${encodeURIComponent(searchTerm)}`;
            const response = await fetch(url);
            if (!response.ok) {
                console.warn('fetchPublicationImages: HTTP', response.status);
                return [];
            }
            const data = await response.json();
            const list = Array.isArray(data.images) ? data.images : [];
            console.log(
                'fetchPublicationImages:',
                list.length,
                'match(es) for',
                JSON.stringify(searchTerm),
                'via',
                url
            );
            const toAbsoluteIfNeeded = (u) => {
                if (!u || typeof u !== 'string') return u;
                if (u.startsWith('http://') || u.startsWith('https://')) return u;
                if (typeof window !== 'undefined' && u.startsWith('/') && window.location.origin) {
                    return `${window.location.origin}${u}`;
                }
                return u;
            };
            return list.map((img) => ({
                source: 'publication',
                title: img.title || 'Untitled',
                thumbnailUrl: toAbsoluteIfNeeded(img.thumbnailUrl),
                fullUrl: toAbsoluteIfNeeded(img.fullUrl || img.thumbnailUrl),
                license: img.license,
                localPublication: true,
            }));
        } catch (e) {
            console.warn('fetchPublicationImages:', e.message);
            return [];
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

            // Process and filter results (use API thumburl — manual /commons/thumb/… construction is often wrong)
            const results = Object.values(data.query.pages)
                .filter(item => item.imageinfo && item.imageinfo[0])
                .map(item => {
                    const imageInfo = item.imageinfo[0];
                    const metadata = imageInfo.extmetadata || {};
                    const fullUrl = imageInfo.url;
                    const thumbnailUrl = imageInfo.thumburl || imageInfo.url;

                    return {
                        source: 'commons',
                        title: item.title.replace('File:', '').replace(/\.[^/.]+$/, ''),
                        thumbnailUrl,
                        fullUrl,
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

    async fetchClevelandImages(searchTerm) {
        console.log('\n=== Cleveland Museum of Art API Search ===');
        console.log('fetchClevelandImages: Starting fetch for term:', searchTerm);
        try {
            const url = `${this.proxyUrl}/cleveland?q=${encodeURIComponent(searchTerm)}&limit=10`;
            console.log('fetchClevelandImages: Fetching from URL:', url);

            const response = await fetch(url);
            console.log('fetchClevelandImages: Response status:', response.status);

            if (!response.ok) {
                console.error('Cleveland API Error:', response.status);
                const errorText = await response.text();
                console.error('Cleveland API Error Details:', errorText);
                return [];
            }

            const data = await response.json();
            console.log('fetchClevelandImages: Raw API response:', data);

            const artworks = Array.isArray(data?.data) ? data.data : [];
            if (!artworks.length) {
                console.log('fetchClevelandImages: No results found in response');
                return [];
            }

            const results = artworks
                .filter(artwork => artwork?.images?.web?.url && artwork?.share_license_status === 'CC0')
                .map(artwork => {
                    const webImage = artwork.images.web;
                    const printImage = artwork.images.print;
                    const fullImage = artwork.images.full;
                    const creators = Array.isArray(artwork.creators) ? artwork.creators : [];
                    const primaryCreator = creators[0];
                    const culture = Array.isArray(artwork.culture) ? artwork.culture.join('; ') : (artwork.culture || '');

                    return {
                        source: 'cleveland',
                        title: artwork.title || 'Untitled',
                        thumbnailUrl: webImage.url,
                        fullUrl: (printImage?.url || fullImage?.url || webImage.url),
                        artist: primaryCreator?.description || 'Unknown Artist',
                        culture,
                        license: 'CC0 (Cleveland Museum of Art)'
                    };
                });

            console.log('fetchClevelandImages: Processed results:', results.length);
            return results;
        } catch (error) {
            console.error('Error in fetchClevelandImages:', error);
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
            if (this.lastSearchTag) {
                this._emitTagsPanelImagesMeta(this.lastSearchTag, []);
            }
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
        const sources = this.getSearchSourceCatalog().map(({ name, url }) => ({ name, url }));
        return createBottomLoadingOverlay(this.bottomPanel, {
            title: 'Loading images...',
            subtext: 'This may take a few seconds',
            sources,
        });
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
                if (image.localPublication) {
                    console.log('✓ Publication image (trusted local):', image.title);
                    return image;
                }
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

    async displayImages(images, searchQueryTag = null) {
        console.log('displayImages: Starting to display images:', images.length);
        if (!this.bottomPanel) {
            console.error('displayImages: Bottom panel not found');
            return;
        }

        const tagForMeta = String(searchQueryTag ?? this.lastSearchTag ?? '').trim();

        if (!images.length) {
            console.log('displayImages: No images to display');
            this.hideLoading();
            this.bottomPanel.innerHTML = '<p>No images found.</p>';
            if (tagForMeta) {
                this._emitTagsPanelImagesMeta(tagForMeta, []);
            }
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
            if (tagForMeta) {
                this._emitTagsPanelImagesMeta(tagForMeta, []);
            }
            return;
        }

        // Store current images for gallery
        this.currentImages = validImages;

        const uniqueSourceKeys = [...new Set(validImages.map((im) => im.source))];
        const apiListHtml = uniqueSourceKeys
            .map((key) => {
                const meta = this.getSourcePublicMeta(key);
                const link =
                    meta.url &&
                    `<a class="image-gallery-api-link" href="${escAttr(meta.url)}" target="_blank" rel="noopener noreferrer">${escHtml(
                        meta.url
                    )}</a>`;
                return `<li class="image-gallery-api-item"><span class="image-gallery-api-name">${escHtml(
                    meta.name
                )}</span>${link || ''}</li>`;
            })
            .join('');

        const galleryHTML = `
            <div class="image-gallery-toolbar">
                <button
                    type="button"
                    class="image-gallery-back-circle"
                    aria-label="Go back to tags"
                    title="Go back to tags"
                >
                    <img class="image-gallery-back-icon" src="${goBackIcon}" alt="" aria-hidden="true">
                </button>
                <div class="image-gallery-api-block">
                    <h3 class="image-gallery-api-heading">Origin of Images:</h3>
                    <ul class="image-gallery-api-list" aria-label="Image sources for this search">
                        ${apiListHtml}
                    </ul>
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
        this._setupTouchScrollIsolation();
        this.bottomPanel
            .querySelector('.image-gallery-back-circle')
            ?.addEventListener('click', () => this.returnToTags());

        const sourceDisplayNames = uniqueSourceKeys.map((key) => this.getInstitutionName(key));
        if (tagForMeta) {
            this._emitTagsPanelImagesMeta(tagForMeta, sourceDisplayNames);
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