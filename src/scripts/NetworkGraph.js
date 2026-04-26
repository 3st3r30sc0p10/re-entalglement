// src/scripts/NetworkGraph.js
import * as d3 from 'd3';

/** D3 force links use source/target as objects; comparisons need a stable id. */
function linkEndpointId(endpoint) {
    if (endpoint == null) return null;
    return typeof endpoint === 'object' ? endpoint.id : endpoint;
}

/** Stable pseudo-depth in [-1, 1] for zoom parallax (independent of layout frame). */
function stableDepthSigned(id) {
    const s = String(id ?? '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const u = ((h >>> 0) % 10001) / 10000;
    return u * 2 - 1;
}

/** Undirected co-tag edges between videos (for baseline layout when tag nodes are hidden). */
function buildCoTagVideoLinks(nodes, videoTagLinks) {
    const tagToVideos = new Map();
    for (const link of videoTagLinks) {
        if (link.type !== 'video-tag') continue;
        const vId = linkEndpointId(link.source);
        const tId = linkEndpointId(link.target);
        if (!tagToVideos.has(tId)) tagToVideos.set(tId, []);
        tagToVideos.get(tId).push(vId);
    }
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const seen = new Set();
    const out = [];
    tagToVideos.forEach((ids) => {
        const unique = [...new Set(ids)];
        for (let i = 0; i < unique.length; i++) {
            for (let j = i + 1; j < unique.length; j++) {
                const a = unique[i];
                const b = unique[j];
                const key = a < b ? `${a}|${b}` : `${b}|${a}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const n1 = nodeById.get(a);
                const n2 = nodeById.get(b);
                if (n1 && n2 && n1.type === 'video' && n2.type === 'video') {
                    out.push({ source: n1, target: n2, type: 'video-video' });
                }
            }
        }
    });
    return out;
}

const HOVER_LINK_OPACITY = 1;
const HOVER_LINK_FADED = 0.28;

/** Max characters per line for video titles (word-aware breaks; additional lines as needed). */
const VIDEO_LABEL_WRAP_THRESHOLD = 25;

/**
 * Split into one or more lines, each at most {@link VIDEO_LABEL_WRAP_THRESHOLD} characters
 * where possible (break at spaces; hard break if no space). Continues until all text consumed.
 */
function splitVideoLabelLines(label) {
    if (!label || typeof label !== 'string') return [''];
    let rest = label.trim();
    if (!rest) return [''];
    const max = VIDEO_LABEL_WRAP_THRESHOLD;
    const lines = [];

    while (rest.length > max) {
        let cut = -1;
        const before = rest.lastIndexOf(' ', max);
        if (before > 0) cut = before;
        if (cut < 0) {
            const after = rest.indexOf(' ', max);
            if (after !== -1) cut = after;
        }
        if (cut <= 0) cut = max;

        const chunk = rest.slice(0, cut).trimEnd();
        const next = rest.slice(cut).trimStart();
        if (chunk.length > 0) {
            lines.push(chunk);
            rest = next;
        } else {
            lines.push(rest.slice(0, max));
            rest = rest.slice(max).trimStart();
        }
    }
    if (rest.length > 0) lines.push(rest);
    return lines;
}

/** Longest line length after wrapping — for collision radius and camera fit. */
function videoTitleLayoutCharSpan(label) {
    const lines = splitVideoLabelLines(label);
    return Math.max(...lines.map((s) => s.length), 0);
}

function videoTitleLineCount(label) {
    return splitVideoLabelLines(label).length;
}

function nodeLabelLengthForLayout(node) {
    if (!node || !node.label) return 0;
    if (node.type === 'video') return videoTitleLayoutCharSpan(node.label);
    return node.label.length;
}

export class NetworkGraph {
  constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = null;
        this.map = null; // Initialize map as null
        this.options = {
            nodeRadius: 8,
            nodeColor: getComputedStyle(document.documentElement)
                .getPropertyValue('--color-node').trim(),
            linkDistance: 100,
            width: 800,
            height: 600,
            ...options
        };

        this.nodes = [];
        this.links = [];
        this.simulation = null;
        this.svg = null;
        this.zoom = null;
        this.selectedNode = null;
        this.graphContainer = null;
        /** Fixed viewport legend (not inside zoomed graph layer). */
        this.referenceLegend = null;
        this.linkElements = null;
        this.nodeElements = null;
        this.markers = [];
        this.dataProcessor = null;
        /** Tag node used to restore link styles after hover (parallel to selectedNode for videos) */
        this.selectedTagNode = null;
        /** After layout, zoom/pan so all video nodes fit in view (setData / full reset). */
        this._fitVideoBoundsAfterLayout = false;
        /** After simulation settles, pan/zoom so this node is at viewport center (video click). */
        this._centerOnNodeAfterLayout = null;

        /** Zoom parallax: last k used for depth paint-order sort (invalidate with NaN on full rebuild). */
        this._lastDepthPaintK = NaN;

        /** True while pointer is over a tag (yellow) node — drives tagNodeHoverEnd on leave. */
        this._graphHoverTagActive = false;
        /** True while pointer is over a tail (red) node — drives tailNodeHoverEnd on leave. */
        this._graphHoverTailActive = false;
        /** Guided demo: show every node type + co-tag edges; rail visible without opening slide panels. */
        this._interfaceTourMode = false;

        /** Graph paint colors — synced from CSS tokens (Charcoal & Amber — definitive palette fallbacks) */
        this._graphColors = {
            NODE_VIDEO: '#1c1917',
            NODE_TAG: '#f59e0b',
            NODE_TAIL: '#f87171',
            LINK_VIDEO_TAG: '#8b939c',
            LINK_VIDEO_TAIL: '#f87171',
            LINK_VIDEO_VIDEO: '#6b7280',
        };
        this._graphLabelFill = '#2a2a2a';
        this._graphLabelStroke = '#ffffff';

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initialize();
            });
        } else {
            this.initialize();
        }
    }

    initialize() {
        try {
            const containerElement = document.getElementById(this.containerId);
            if (!containerElement) {
                throw new Error(`Container element with id '${this.containerId}' not found`);
            }

            this.container = d3.select(`#${this.containerId}`);
            const containerRect = containerElement.getBoundingClientRect();
            this.options.width = containerRect.width || this.options.width;
            this.options.height = containerRect.height || this.options.height;

            this.svg = this.container
                .append('svg')
                .attr('width', this.options.width)
                .attr('height', this.options.height)
                .attr('class', 'network-graph-svg')
                .attr('overflow', 'visible');

            this.zoom = d3.zoom()
                .scaleExtent([0.5, 3])
                .on('zoom', (event) => {
                    this.graphContainer.attr('transform', event.transform);
                    this._applyDepthPaintOrder(event.transform.k);
                    this._updateNodeParallaxTransforms(event.transform.k);
                });

            this.svg.call(this.zoom);

            this.graphContainer = this.svg
                .append('g')
                .attr('class', 'graph-container')
                .attr('transform', `translate(${this.options.width / 2},${this.options.height / 2})`);

            this.referenceLegend = this.svg
                .append('g')
                .attr('class', 'graph-reference-legend')
                .attr('pointer-events', 'none');
            this._refreshGraphColorsFromCss();
            this._updateReferenceLegend();

            this.simulation = d3.forceSimulation()
                // Cool down quickly so the graph settles instead of drifting forever
                .alphaDecay(0.09)
                .velocityDecay(0.58)
                .force("link", d3.forceLink()
                    .id(d => d.id)
                    .distance((d) => {
                        if (d.type === 'video-video') {
                            return 200;
                        }
                        const sourceLength = nodeLabelLengthForLayout(d.source);
                        const targetLength = nodeLabelLengthForLayout(d.target);
                        return Math.max(100, (sourceLength + targetLength) * 5);
                    })
                )
                .force("charge", d3.forceManyBody()
                    .strength((d) => {
                        switch (d.type) {
                            case 'video': return -720;
                            case 'tag': return -580;
                            case 'tail': return -380;
                            default: return -520;
                        }
                    })
                    .distanceMin(180)
                    .distanceMax(900)
                )
                .force("collide", d3.forceCollide()
                    .radius(d => {
                        const baseRadius = this.getNodeRadius(d);
                        const labelLength = nodeLabelLengthForLayout(d);
                        const multilineY =
                            d.type === 'video' ? Math.max(0, videoTitleLineCount(d.label) - 1) * 12 : 0;
                        return baseRadius + labelLength * 4 + multilineY;
                    })
                    .strength(0.85)
                    .iterations(2)
                )
                .force("center", d3.forceCenter(0, 0))
                .force("x", d3.forceX()
                    .strength(0.045)
                    .x(d => {
                        // Spread nodes horizontally based on type
                        switch(d.type) {
                            case 'video': return 0;
                            case 'tag': return -this.options.width / 4;
                            case 'tail': return this.options.width / 4;
                            default: return 0;
                        }
                    })
                )
                .force("y", d3.forceY()
                    .strength(0.045)
                    .y(0)
                );

            this.initializeMap();
            window.addEventListener('resize', this.handleResize.bind(this));

            // Add background click handler (full reset like the Reset button)
            this.svg.on('click', (event) => {
                if (event.target === this.svg.node()) {
                    this.resetVisualization();
                }
            });

            // Select buttons using their IDs
            const zoomInBtn = document.getElementById('zoom-in');
            const zoomOutBtn = document.getElementById('zoom-out');
            const resetBtn = document.getElementById('zoom-reset');

            if (zoomInBtn && zoomOutBtn && resetBtn) {
                zoomInBtn.addEventListener('click', () => {
                    const transform = d3.zoomTransform(this.svg.node());
                    this.svg.transition()
                        .duration(200)
                        .call(this.zoom.transform, 
                            d3.zoomIdentity
                                .translate(transform.x, transform.y)
                                .scale(transform.k * 1.3));
                });

                zoomOutBtn.addEventListener('click', () => {
                    const transform = d3.zoomTransform(this.svg.node());
                    this.svg.transition()
                        .duration(200)
                        .call(this.zoom.transform, 
                            d3.zoomIdentity
                                .translate(transform.x, transform.y)
                                .scale(transform.k / 1.3));
                });

                resetBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.resetVisualization();
                });
            }
        } catch (error) {
            console.error('Failed to initialize network graph:', error);
            throw error;
        }
    }

    initializeMap() {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            console.log('Map container with id "map" not found - map functionality disabled');
            return;
        }

        // Check if the map has already been initialized
        if (this.map) {
            console.warn('Map is already initialized.');
            return;
        }

        try {
            this.map = L.map(mapContainer).setView([20, 0], 2);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 18,
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(this.map);

            this.markers = [];
        } catch (error) {
            console.error('Error initializing map:', error);
        }
    }

    handleResize() {
        const containerElement = document.getElementById(this.containerId);
        if (!containerElement) return;

        const containerRect = containerElement.getBoundingClientRect();
        this.options.width = containerRect.width;
        this.options.height = containerRect.height;

        this.svg
            .attr('width', this.options.width)
            .attr('height', this.options.height);

        this.simulation
            .force('center', d3.forceCenter(0, 0));

        this.graphContainer
            .attr('transform', `translate(${this.options.width / 2},${this.options.height / 2})`);

        this.graphContainer.selectAll('.node-label')
            .style('font-size', (d) => this.getLabelFontSizePx(d));

        this.simulation.alpha(0.12).restart();

        if (this._isBaselineView() && this.nodes?.length) {
            requestAnimationFrame(() => this._fitViewToGraphNodes());
        }

        this._refreshGraphColorsFromCss();
        this._updateReferenceLegend();
    }

    /** Legend for node colors: only while a presentation (video) node is selected. */
    _shouldShowReferenceLegend() {
        return this.selectedNode != null && this.selectedNode.type === 'video';
    }

    /**
     * Top-centered key: presentation (video), distant reading (tag), close reading (tail).
     * Lives outside the zoomed graph container so it stays fixed while panning/zooming.
     */
    _updateReferenceLegend() {
        if (!this.referenceLegend || !this.svg) return;
        if (!this._shouldShowReferenceLegend()) {
            this.referenceLegend.selectAll('*').remove();
            this.referenceLegend.style('display', 'none');
            return;
        }
        this.referenceLegend.style('display', null);

        const gc = this._graphColors;
        const w = this.options.width;
        const specs = [
            { fill: gc.NODE_VIDEO, label: 'Presentation', textFill: gc.NODE_VIDEO },
            { fill: gc.NODE_TAG, label: 'Distant reading', textFill: gc.NODE_TAG },
            { fill: gc.NODE_TAIL, label: 'Close reading', textFill: gc.NODE_TAIL },
        ];

        const r = 8;
        const colGap = Math.max(14, Math.min(24, w * 0.022));
        const fs = w < 520 ? 12 : 13;
        const framePadX = 12;
        /** Extra space inside the panel above/below the row (circle + label); tune these to change panel height only. */
        const framePadTop = 2;
        const framePadBottom = 2;

        const colWidths = specs.map((s) =>
            r * 2 + 8 + s.label.length * fs * 0.54
        );
        const total =
            colWidths.reduce((a, b) => a + b, 0) + colGap * (specs.length - 1);
        const frameX = 10;
        const frameY = 10;
        const frameW = total + framePadX * 2;
        // Row must fit the label em-box, not only the circle — otherwise the rect shrinks but
        // glyphs still paint at full size, so changing vertical padding looks like it "does nothing".
        const contentRowH = Math.max(r * 2, fs * 1.28);
        const frameH = contentRowH + framePadTop + framePadBottom;
        const frameR = Math.min(10, Math.max(4, frameH / 2));
        const centerY = frameY + frameH / 2;

        let cursorX = frameX + framePadX;
        const root = this.referenceLegend;
        root.selectAll('*').remove();
        root.attr('pointer-events', 'none');
        root
            .append('rect')
            .attr('class', 'reference-legend-frame')
            .attr('x', frameX)
            .attr('y', frameY)
            .attr('width', frameW)
            .attr('height', frameH)
            .attr('rx', frameR)
            .attr('ry', frameR)
            .attr('pointer-events', 'none');

        specs.forEach((s, i) => {
            const colW = colWidths[i];
            const cx = cursorX + r;
            const tx = cx + r + 8;
            cursorX += colW + colGap;

            const item = root.append('g').attr('class', 'reference-legend-item');
            item
                .append('circle')
                .attr('class', 'reference-legend-circle')
                .attr('r', r)
                .attr('cx', cx)
                .attr('cy', centerY)
                .attr('fill', s.fill)
                .attr('pointer-events', 'none');
            item
                .append('text')
                .attr('class', 'reference-legend-label')
                .attr('x', tx)
                .attr('y', centerY)
                .attr('text-anchor', 'start')
                .attr('dominant-baseline', 'middle')
                .attr('fill', s.textFill)
                .style('font-size', `${fs}px`)
                .attr('pointer-events', 'none')
                .text(s.label);
        });
    }

    _refreshGraphColorsFromCss() {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        const g = (name, fb) => {
            const v = getComputedStyle(root).getPropertyValue(name).trim();
            return v || fb;
        };
        this._graphColors = {
            NODE_VIDEO: g('--graph-node-video', this._graphColors.NODE_VIDEO),
            NODE_TAG: g('--graph-node-tag', this._graphColors.NODE_TAG),
            NODE_TAIL: g('--graph-node-tail', this._graphColors.NODE_TAIL),
            LINK_VIDEO_TAG: g('--graph-link-video-tag', this._graphColors.LINK_VIDEO_TAG),
            LINK_VIDEO_TAIL: g('--graph-link-video-tail', this._graphColors.LINK_VIDEO_TAIL),
            LINK_VIDEO_VIDEO: g('--graph-link-video-video', this._graphColors.LINK_VIDEO_VIDEO),
        };
        this._graphLabelFill = g('--graph-label-fill', this._graphLabelFill);
        this._graphLabelStroke = g('--graph-label-stroke', this._graphLabelStroke);
    }

    setData(nodes, links, dataProcessor) {
        this.dataProcessor = dataProcessor;
        const tagLinks = links.filter((l) => l.type === 'video-tag');
        const coTagLinks = buildCoTagVideoLinks(nodes, tagLinks);
        this.originalNodes = [...nodes];
        this.originalLinks = [...links, ...coTagLinks];
        this.nodes = [...nodes];
        this.links = [...this.originalLinks];
        this._centerOnNodeAfterLayout = null;
        this._fitVideoBoundsAfterLayout = true;
        this.updateVisualization();
    }

    updateVisualization() {
        console.log('NetworkGraph: updateVisualization called');
        console.log('NetworkGraph: Nodes count:', this.nodes.length);
        console.log('NetworkGraph: Links count:', this.links.length);
        console.log('NetworkGraph: Sample nodes:', this.nodes.slice(0, 3));

        this._refreshGraphColorsFromCss();
        const gc = this._graphColors;
        const labelFill = this._graphLabelFill;
        const labelStroke = this._graphLabelStroke;

        this._updateReferenceLegend();

        this._lastDepthPaintK = NaN;
        this.nodes.forEach((d) => {
            if (d._depthSigned == null) d._depthSigned = stableDepthSigned(d.id);
        });

        // Remove existing elements
        this.graphContainer.selectAll('.link').remove();
        this.graphContainer.selectAll('.node-group').remove();

        // Create links
        this.linkElements = this.graphContainer
            .selectAll('.link')
            .data(this.links)
            .enter()
            .append('line')
            .attr('class', 'link')
            .style('stroke', (d) => {
                if (d.type === 'video-tail') return gc.LINK_VIDEO_TAIL;
                if (d.type === 'video-video') return gc.LINK_VIDEO_VIDEO;
                return gc.LINK_VIDEO_TAG;
            })
            .style('stroke-width', (d) => (d.type === 'video-video' ? 1.25 : 1.5))
            .style('opacity', 0.6);

        // Create node groups
        const nodeGroups = this.graphContainer
            .selectAll('.node-group')
            .data(this.nodes)
            .enter()
            .append('g')
            .attr('class', 'node-group')
            .call(this.dragBehavior());
            
        console.log('NetworkGraph: Created node groups:', nodeGroups.size());

        // Add circles to node groups
        this.nodeElements = nodeGroups
            .append('circle')
            .attr('class', 'node')
            .attr('r', d => this.getNodeRadius(d))
            .style('fill', d => {
                switch (d.type) {
                    case 'video': return gc.NODE_VIDEO;
                    case 'tag': return gc.NODE_TAG;
                    case 'tail': return gc.NODE_TAIL;
                    default: return gc.NODE_VIDEO;
                }
            });

        // Add labels to node groups (video: tspans, same left margin per line; wrap every >25 chars)
        this.labelElements = nodeGroups
            .append('text')
            .attr('class', d => `node-label node-label--${d.type || 'video'}`)
            .attr('dx', d => this.getNodeRadius(d) + 6)
            .attr('dy', '.32em')
            .style('font-size', d => this.getLabelFontSizePx(d))
            .style('fill', labelFill)
            .style('pointer-events', 'none')
            .style('paint-order', 'stroke')
            .style('stroke', labelStroke)
            .style('stroke-width', 1.1)
            .style('stroke-linejoin', 'round')
            .each((d, i, g) => {
                const el = d3.select(g[i]);
                el.selectAll('tspan').remove();
                const raw = d.label != null ? String(d.label) : '';
                const indent = this.getNodeRadius(d) + 6;
                if (d.type === 'video' && raw.trim().length > VIDEO_LABEL_WRAP_THRESHOLD) {
                    /* tspans with x=0 align to the group origin and overlap the circle; use same x as first line */
                    el.attr('dx', null).attr('x', indent);
                    splitVideoLabelLines(raw).forEach((line, j) => {
                        const span = el.append('tspan').attr('x', indent).text(line);
                        if (j > 0) span.attr('dy', '1.15em');
                    });
                } else {
                    el.attr('x', null).attr('dx', indent);
                    el.text(raw);
                }
            });

        // Add event listeners to node groups
        nodeGroups
            .on('click', (event, d) => {
                console.log('NetworkGraph: Node clicked!', d);
                this.handleNodeClick(d);
            })
            .on('mouseover', (event, d) => this.handleNodeHover(event, d))
            .on('mouseout', () => this.handleNodeUnhover());

        // Update simulation
        this.simulation
            .nodes(this.nodes);

        this.simulation.force('link')
            .links(this.links);

        // Update tick function
        this.simulation.on('tick', () => {
            this.linkElements
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            const k = this._getZoomScaleK();
            nodeGroups.attr('transform', (d) => this._nodeParallaxTransform(d, k));
        });

        this.simulation.on('end', () => {
            if (this.simulation) this.simulation.stop();
            if (this._fitVideoBoundsAfterLayout) {
                this._fitVideoBoundsAfterLayout = false;
                this._centerOnNodeAfterLayout = null;
                requestAnimationFrame(() => this._fitViewToGraphNodes());
            } else if (this._centerOnNodeAfterLayout) {
                const target = this._centerOnNodeAfterLayout;
                this._centerOnNodeAfterLayout = null;
                requestAnimationFrame(() => {
                    if (target && target.x != null && target.y != null) {
                        this._centerCameraOnNode(target);
                    }
                });
            }
        });

        // Run layout; alpha decays quickly so motion stops (see alphaDecay / velocityDecay)
        this.simulation.alpha(1).restart();

        this._applyTagSubnodeVisibility();

        requestAnimationFrame(() => {
            const k0 = this._getZoomScaleK();
            this._lastDepthPaintK = NaN;
            this._applyDepthPaintOrder(k0);
            this._updateNodeParallaxTransforms(k0);
        });
    }

    _isBaselineView() {
        if (this._interfaceTourMode) return false;
        return !(this.selectedNode && this.selectedNode.type === 'video') && !this.selectedTagNode;
    }

    _getZoomScaleK() {
        if (!this.svg || !this.zoom) return 1;
        try {
            return d3.zoomTransform(this.svg.node()).k;
        } catch {
            return 1;
        }
    }

    /** How strongly zoom amplifies pseudo-3D (0 at min zoom → stronger as user zooms in). */
    _depthZoomSpread(k) {
        if (k == null || !Number.isFinite(k)) return 0;
        return Math.max(0, Math.min(1.45, (k - 0.48) * 0.36));
    }

    /**
     * Per-node transform: scale around the node center (simulation x,y) so “closer” nodes read larger
     * when zoomed in. Translation matches link endpoints; no Y offset so edges stay glued to circles.
     */
    _nodeParallaxTransform(d, k) {
        const spread = this._depthZoomSpread(k);
        const z = d._depthSigned ?? 0;
        const scale = 1 + z * spread * 0.38;
        return `translate(${d.x},${d.y}) scale(${scale})`;
    }

    /** Re-stack node groups so higher pseudo-depth draws on top (“pass through” order). */
    _applyDepthPaintOrder(k) {
        if (!this.graphContainer) return;
        if (this._lastDepthPaintK === k) return;
        this._lastDepthPaintK = k;
        const spread = this._depthZoomSpread(k);
        const w = 0.1 + spread;
        this.graphContainer.selectAll('.node-group').sort((a, b) => {
            const ka = (a._depthSigned ?? 0) * w;
            const kb = (b._depthSigned ?? 0) * w;
            if (ka !== kb) return ka - kb;
            return String(a.id).localeCompare(String(b.id));
        });
    }

    _updateNodeParallaxTransforms(k) {
        if (!this.graphContainer) return;
        const kk = k == null ? this._getZoomScaleK() : k;
        this.graphContainer.selectAll('.node-group').attr('transform', (d) => this._nodeParallaxTransform(d, kk));
    }

    /**
     * Baseline: only main (video) nodes + co-tag edges; yellow tags and video–tag edges hidden.
     * With video or tag focus, applyVideo* / applyTag* control opacities (do not override here).
     */
    _applyTagSubnodeVisibility() {
        if (!this.graphContainer) return;
        const videoSelected = this.selectedNode != null && this.selectedNode.type === 'video';
        const tagFocus = this.selectedTagNode != null;

        const tagGroups = this.graphContainer.selectAll('.node-group').filter((d) => d.type === 'tag');
        const tagLinks = this.graphContainer.selectAll('.link').filter((d) => d.type === 'video-tag');
        const coLinks = this.graphContainer.selectAll('.link').filter((d) => d.type === 'video-video');

        if (this._interfaceTourMode) {
            tagGroups.style('visibility', 'visible').style('pointer-events', 'auto');
            tagLinks.style('visibility', 'visible').style('pointer-events', 'none');
            coLinks
                .style('visibility', 'visible')
                .style('pointer-events', 'none');
            return;
        }

        if (videoSelected || tagFocus) {
            tagGroups.style('visibility', 'visible').style('pointer-events', 'auto');
            tagLinks.style('visibility', 'visible');
            if (videoSelected) {
                coLinks.style('visibility', 'hidden').style('pointer-events', 'none');
            } else {
                coLinks.style('visibility', 'visible').style('pointer-events', 'none').style('opacity', 0.22);
            }
            return;
        }

        tagGroups
            .style('visibility', 'hidden')
            .style('pointer-events', 'none')
            .style('opacity', 1);
        tagLinks.style('visibility', 'hidden').style('opacity', 0.55);
        coLinks
            .style('visibility', 'visible')
            .style('pointer-events', 'none')
            .style('opacity', 0.56);
    }

    /**
     * Zoom/pan so all laid-out nodes (videos, tags, tails) and label extent fit in the viewport.
     */
    _fitViewToGraphNodes() {
        const positionedAll = this.nodes.filter((n) => n.x != null && n.y != null);
        const positioned = this._isBaselineView()
            ? positionedAll.filter((n) => n.type === 'video')
            : positionedAll;
        if (!positioned.length || !this.svg || !this.zoom) return;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const nodePad = 88;
        const labelW = (n) => {
            const cap = n.type === 'video' ? 280 : 220;
            const mul = n.type === 'video' ? 5.5 : 4.25;
            const len = n.type === 'video' ? videoTitleLayoutCharSpan(n.label) : (n.label?.length || 0);
            return Math.min(len * mul, cap);
        };

        for (const n of positioned) {
            const lx = labelW(n);
            const extraX = n.type === 'video' ? lx : lx * 0.65;
            const extraY =
                n.type === 'video' ? Math.max(0, videoTitleLineCount(n.label) - 1) * 22 : 0;
            minX = Math.min(minX, n.x - nodePad);
            maxX = Math.max(maxX, n.x + nodePad + extraX);
            minY = Math.min(minY, n.y - nodePad);
            maxY = Math.max(maxY, n.y + nodePad + extraY);
        }

        if (!Number.isFinite(minX)) return;

        const bw = Math.max(maxX - minX, 120);
        const bh = Math.max(maxY - minY, 120);
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;

        const kRaw =
            Math.min(this.options.width / bw, this.options.height / bh, 2.85) * 0.9;
        const k = Math.max(0.2, Math.min(kRaw, 3));

        const transform = d3.zoomIdentity
            .translate(this.options.width / 2, this.options.height / 2)
            .scale(k)
            .translate(-midX, -midY);

        this.svg
            .transition()
            .duration(520)
            .ease(d3.easeCubicOut)
            .call(this.zoom.transform, transform);
    }

    /**
     * Pan/zoom so the node's graph coordinates (x, y) land at the SVG viewport center.
     * Keeps current zoom scale (clamped to scaleExtent).
     */
    _centerCameraOnNode(node, duration = 480) {
        if (!this.svg || !this.zoom || !node || node.x == null || node.y == null) return;
        const w = this.options.width;
        const h = this.options.height;
        const t = d3.zoomTransform(this.svg.node());
        let k = t.k;
        const extent = this.zoom.scaleExtent();
        k = Math.max(extent[0], Math.min(extent[1], k));
        const transform = d3.zoomIdentity
            .translate(w / 2 - node.x * k, h / 2 - node.y * k)
            .scale(k);

        this.svg
            .transition()
            .duration(duration)
            .ease(d3.easeCubicOut)
            .call(this.zoom.transform, transform);
    }

    /** Draw the node's circle/label above other nodes (SVG paint order). */
    _raiseNodeGroup(node) {
        if (!this.graphContainer || !node) return;
        this.graphContainer
            .selectAll('.node-group')
            .filter((d) => d.id === node.id)
            .raise();
    }

    handleNodeClick(node, options = {}) {
        const { silent = false, tourPrepare = false } = options;
        console.log('NetworkGraph: handleNodeClick called with node:', node);
        if (node.type === 'video') {
            console.log("Selected node data:", node);
            console.log("Node tails:", node.data?.tails);
            
            // Always treat each click as a fresh selection so panels and tags update reliably
            this.selectedNode = node;
            this.selectedTagNode = null;

            // Get all nodes and links that should be visible (used while building tails)
            const visibleNodes = new Set([node.id]);
            const visibleLinks = new Set();

            // Add connected tag nodes and their links
            this.links.forEach(link => {
                if (linkEndpointId(link.source) === node.id && link.type === 'video-tag') {
                    visibleNodes.add(linkEndpointId(link.target));
                    visibleLinks.add(link);
                }
            });

            // Create and add tail nodes and links
            if (node.data && node.data.tails && node.data.tails.length > 0) {
                // Remove any existing tail nodes and links first
                this.nodes = this.nodes.filter(n => n.type !== 'tail');
                this.links = this.links.filter(l => l.type !== 'video-tail');

                // Add new tail nodes and links
                node.data.tails.forEach(tail => {
                    const tailNode = {
                        id: `tail-${tail}`,
                        label: tail,
                        type: 'tail',
                        x: node.x + (Math.random() - 0.5) * 100,  // Random position near the video node
                        y: node.y + (Math.random() - 0.5) * 100
                    };

                    // Add tail node
                    this.nodes.push(tailNode);
                    visibleNodes.add(tailNode.id);

                    // Create and add tail link
                    const tailLink = {
                        source: node,
                        target: tailNode,
                        type: 'video-tail'
                    };
                    this.links.push(tailLink);
                    visibleLinks.add(tailLink);
                });
            }

            // After layout settles, center camera on this video (unless tour wants full-graph fit)
            this._centerOnNodeAfterLayout = tourPrepare ? null : node;
            if (tourPrepare) {
                this._fitVideoBoundsAfterLayout = true;
            }

            // Update the visualization with new nodes and links
            this.updateVisualization();

            this.applyVideoSelectionVisuals(node);
            if (this._interfaceTourMode) {
                this.applyInterfaceTourFullGraphStyles();
            }

            if (!silent) {
                console.log('NetworkGraph: Dispatching nodeSelected event');
                const event = new CustomEvent('nodeSelected', {
                    detail: { node: node },
                });
                document.dispatchEvent(event);
                console.log('NetworkGraph: nodeSelected event dispatched');
            }
        } else if (node.type === 'tag') {
            console.log('NetworkGraph: Tag node clicked:', node.label);
            // First handle the panel interaction (highlight/move tag chips)
            const event = new CustomEvent('tagNodeClick', { 
                detail: { tag: node.label }
            });
            document.dispatchEvent(event);

            // Also trigger the same image search used by tag chips
            const imageEvent = new CustomEvent('tagClick', {
                detail: { tag: node.label }
            });
            document.dispatchEvent(imageEvent);

            // Then handle the network visualization
            this.handleTagNodeClick(node);
            requestAnimationFrame(() => this._centerCameraOnNode(node));
        } else if (node.type === 'tail') {
            // Dispatch a custom event for tail click (to sync panel state)
            const event = new CustomEvent('tailNodeClick', { 
                detail: { 
                    tail: node.label 
                }
            });
            document.dispatchEvent(event);

            // Also trigger chat opening for this tail concept
            const chatEvent = new CustomEvent('tailClick', {
                detail: { tail: node.label }
            });
            document.dispatchEvent(chatEvent);

            requestAnimationFrame(() => {
                this._centerCameraOnNode(node);
                this._raiseNodeGroup(node);
            });
        }
    }

    handleTagNodeClick(tagNode) {
        console.log("Tag node clicked:", tagNode);
        this.selectedTagNode = tagNode;
        this.applyTagFocusStyles(tagNode);
    }

    /** Restore link/node opacity after video selection (also used after hover ends). */
    applyVideoSelectionVisuals(videoNode) {
        if (!this.graphContainer || !videoNode) return;
        const gc = this._graphColors;
        const visibleNodes = new Set([videoNode.id]);
        const visibleLinks = new Set();
        this.links.forEach((link) => {
            const sid = linkEndpointId(link.source);
            if (sid === videoNode.id && link.type === 'video-tag') {
                visibleNodes.add(linkEndpointId(link.target));
                visibleLinks.add(link);
            }
            if (sid === videoNode.id && link.type === 'video-tail') {
                visibleNodes.add(linkEndpointId(link.target));
                visibleLinks.add(link);
            }
        });

        const fadeTag = 0.22;
        const fadeTailNode = 0.2;
        const fadeTailLink = 0.1;
        const fadeOtherTagLink = 0.09;

        this.graphContainer.selectAll('.node-group')
            .style('visibility', 'visible')
            .style('display', null)
            .style('opacity', (d) => {
                if (d.type === 'video') return 1;
                if (d.type === 'tag') return visibleNodes.has(d.id) ? 1 : fadeTag;
                if (d.type === 'tail') return visibleNodes.has(d.id) ? 1 : fadeTailNode;
                return 1;
            });

        this.graphContainer.selectAll('.link')
            .style('visibility', (d) => (d.type === 'video-video' ? 'hidden' : 'visible'))
            .style('display', null)
            .style('stroke', (d) => {
                if (d.type === 'video-tail') return gc.LINK_VIDEO_TAIL;
                if (d.type === 'video-video') return gc.LINK_VIDEO_VIDEO;
                return gc.LINK_VIDEO_TAG;
            })
            .style('opacity', (d) => {
                if (d.type === 'video-video') return 0;
                const sid = linkEndpointId(d.source);
                const onSelected =
                    visibleLinks.has(d)
                    || (sid === videoNode.id && (d.type === 'video-tag' || d.type === 'video-tail'));
                if (onSelected) return 1;
                if (d.type === 'video-tag') return fadeOtherTagLink;
                if (d.type === 'video-tail') return fadeTailLink;
                return 0.35;
            });

        this._applyTagSubnodeVisibility();
        this._raiseNodeGroup(videoNode);
    }

    applyTagFocusStyles(tagNode) {
        if (!this.graphContainer) return;
        const gc = this._graphColors;
        const visibleNodes = new Set([tagNode.id]);
        const visibleLinks = new Set();

        this.links.forEach((link) => {
            if (link.type !== 'video-tag') return;
            const targetId = linkEndpointId(link.target);
            const sourceId = linkEndpointId(link.source);
            if (targetId !== tagNode.id && sourceId !== tagNode.id) return;
            const videoNode = this.nodes.find((n) =>
                n.id === (targetId === tagNode.id ? sourceId : targetId));
            if (videoNode && videoNode.type === 'video') {
                visibleNodes.add(videoNode.id);
                visibleLinks.add(link);
            }
        });

        const fadeNonNode = 0.24;
        const fadeNonLink = 0.14;

        this.graphContainer.selectAll('.node-group')
            .style('visibility', 'visible')
            .style('display', null)
            .style('opacity', (d) => {
                if (d.type === 'video') return 1;
                return visibleNodes.has(d.id) ? 1 : fadeNonNode;
            });

        this.graphContainer.selectAll('.link')
            .style('visibility', 'visible')
            .style('display', null)
            .style('stroke', (d) => {
                if (d.type === 'video-tail') return gc.LINK_VIDEO_TAIL;
                if (d.type === 'video-video') return gc.LINK_VIDEO_VIDEO;
                return gc.LINK_VIDEO_TAG;
            })
            .style('opacity', (d) => {
                if (d.type === 'video-video') return 0.2;
                return visibleLinks.has(d) ? 1 : fadeNonLink;
            });

        this._applyTagSubnodeVisibility();
        this._raiseNodeGroup(tagNode);
    }

    /** Full graph for guided tour: all videos, tags, tails, and link types readable. */
    applyInterfaceTourFullGraphStyles() {
        if (!this.graphContainer || !this._interfaceTourMode) return;
        const gc = this._graphColors;
        this.graphContainer.selectAll('.node-group')
            .style('visibility', 'visible')
            .style('display', null)
            .style('opacity', 1);

        this.graphContainer.selectAll('.link')
            .style('visibility', 'visible')
            .style('display', null)
            .style('stroke', (d) => {
                if (d.type === 'video-tail') return gc.LINK_VIDEO_TAIL;
                if (d.type === 'video-video') return gc.LINK_VIDEO_VIDEO;
                return gc.LINK_VIDEO_TAG;
            })
            .style('opacity', (d) => {
                if (d.type === 'video-video') return 0.52;
                if (d.type === 'video-tag') return 0.72;
                if (d.type === 'video-tail') return 0.88;
                return 0.65;
            });
    }

    /**
     * Tour-only: reveal tags, co-tag edges, inject one lecture’s tail nodes (no app side-effects),
     * then fit the camera to the whole graph.
     */
    beginInterfaceTourGraphState() {
        this._interfaceTourMode = true;
        const video = this.nodes.find((n) => n.type === 'video');
        if (video) {
            this.handleNodeClick(video, { silent: true, tourPrepare: true });
        } else {
            this._fitVideoBoundsAfterLayout = true;
            this.updateVisualization();
            this.applyInterfaceTourFullGraphStyles();
            this._applyTagSubnodeVisibility();
            this.simulation?.alpha(0.2).restart();
        }
        requestAnimationFrame(() => {
            this.applyInterfaceTourFullGraphStyles();
            this._applyTagSubnodeVisibility();
        });
    }

    /** Restore normal baseline / selection behaviour after the tour. */
    endInterfaceTourGraphState() {
        this._interfaceTourMode = false;
        this.resetVisualization();
    }

    applyBaselineLinkAndNodeStyles() {
        if (!this.graphContainer) return;
        if (this._interfaceTourMode) {
            this.applyInterfaceTourFullGraphStyles();
            this._applyTagSubnodeVisibility();
            return;
        }
        if (this.selectedNode && this.selectedNode.type === 'video') {
            this.applyVideoSelectionVisuals(this.selectedNode);
        } else if (this.selectedTagNode) {
            this.applyTagFocusStyles(this.selectedTagNode);
        } else {
            const gc = this._graphColors;
            this.graphContainer.selectAll('.node-group')
                .style('opacity', 1)
                .style('display', null)
                .style('visibility', (d) => (d.type === 'tag' ? 'hidden' : 'visible'));
            this.graphContainer.selectAll('.link')
                .style('display', null)
                .style('stroke', (d) => {
                    if (d.type === 'video-tail') return gc.LINK_VIDEO_TAIL;
                    if (d.type === 'video-video') return gc.LINK_VIDEO_VIDEO;
                    return gc.LINK_VIDEO_TAG;
                })
                .style('visibility', (d) => (d.type === 'video-tag' ? 'hidden' : 'visible'))
                .style('opacity', (d) => (d.type === 'video-video' ? 0.56 : 0.6));
            this._applyTagSubnodeVisibility();
        }
    }

    /** Full initial state: clear selection, restore nodes/links, refit camera, notify app UI. */
    resetVisualization() {
        this.selectedNode = null;
        this.selectedTag = null;
        this.selectedTagNode = null;
        this._centerOnNodeAfterLayout = null;

        this.nodes = this.originalNodes.filter((node) => node.type !== 'tail');
        this.links = this.originalLinks.filter((link) => link.type !== 'video-tail');

        if (this.graphContainer) {
            this.graphContainer.selectAll('.link')
                .style('opacity', 0.6)
                .style('display', null);

            this.graphContainer.selectAll('.node-group')
                .style('opacity', 1)
                .style('display', null);
        }

        this._fitVideoBoundsAfterLayout = true;
        this.updateVisualization();
        if (this.simulation) this.simulation.alpha(0.12).restart();

        document.dispatchEvent(new CustomEvent('visualizationReset'));
    }

    showAllNodes() {
        this.selectedTagNode = null;
        this.nodes = this.nodes.filter(node => node.type !== 'tail');
        this.links = this.links.filter(link => link.type !== 'video-tail');

        this.graphContainer.selectAll('.link')
            .style('opacity', 0.6)
            .style('display', null);

        this.graphContainer.selectAll('.node-group')
            .style('opacity', 1)
            .style('display', null);

        this.updateVisualization();
        this.simulation.alpha(0.12).restart();
    }

    getNodeColor(node) {
        const colors = {
            video: 'var(--graph-node-video)',
            tag: 'var(--graph-node-tag)',
            place: 'var(--graph-node-video)',
            tail: 'var(--graph-node-tail)',
        };
        return colors[node.type] || this.options.nodeColor;
    }

    dragBehavior() {
        return d3.drag()
            .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.18).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
    }

    tick() {
        const padding = 50; // Padding from edges

        this.nodeElements
            .attr("cx", d => Math.max(padding, Math.min(this.options.width - padding, d.x)))
            .attr("cy", d => Math.max(padding, Math.min(this.options.height - padding, d.y)));

        this.linkElements
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        // Update node group positions (includes labels)
        this.graphContainer.selectAll(".node-group")
            .attr("transform", d => `translate(${
                Math.max(padding, Math.min(this.options.width - padding, d.x))
            },${
                Math.max(padding, Math.min(this.options.height - padding, d.y))
            })`);
    }

    handleNodeHover(event, d) {
        if (!this.graphContainer || !this.linkElements) return;

        this._graphHoverTagActive = d.type === 'tag';
        this._graphHoverTailActive = d.type === 'tail';

        // Handle tail node hover
        if (d.type === 'tail') {
            const hoverEvt = new CustomEvent('tailNodeHover', {
                detail: { tail: d.label }
            });
            document.dispatchEvent(hoverEvt);
        } else if (d.type === 'tag') {
            const hoverEvt = new CustomEvent('tagNodeHover', {
                detail: { tag: d.label }
            });
            document.dispatchEvent(hoverEvt);
        }

        const connectedNodeIds = this.links
            .filter((link) => linkEndpointId(link.source) === d.id || linkEndpointId(link.target) === d.id)
            .flatMap((link) => [linkEndpointId(link.source), linkEndpointId(link.target)]);

        this.graphContainer.selectAll('.node-group')
            .style('opacity', (n) => (connectedNodeIds.includes(n.id) ? 1 : 0.52));

        this.linkElements
            .style('opacity', (link) => {
                const on = linkEndpointId(link.source) === d.id || linkEndpointId(link.target) === d.id;
                return on ? HOVER_LINK_OPACITY : HOVER_LINK_FADED;
            })
            .style('stroke', (link) => {
                const on = linkEndpointId(link.source) === d.id || linkEndpointId(link.target) === d.id;
                return on ? 'var(--color-edge-highlighted)' : 'var(--color-edge)';
            });
    }

    handleNodeUnhover() {
        if (!this.graphContainer || !this.linkElements) return;
        if (this._graphHoverTagActive) {
            document.dispatchEvent(new CustomEvent('tagNodeHoverEnd'));
        }
        if (this._graphHoverTailActive) {
            document.dispatchEvent(new CustomEvent('tailNodeHoverEnd'));
        }
        this._graphHoverTagActive = false;
        this._graphHoverTailActive = false;
        this.applyBaselineLinkAndNodeStyles();
    }

  zoomIn() {
      if (this.svg && this.zoom) {
          const transform = d3.zoomTransform(this.svg.node());
          this.svg.transition()
              .duration(200)
              .call(this.zoom.transform, 
                  d3.zoomIdentity
                      .translate(transform.x, transform.y)
                      .scale(transform.k * 1.3));
      }
  }

  zoomOut() {
      if (this.svg && this.zoom) {
          const transform = d3.zoomTransform(this.svg.node());
          this.svg.transition()
              .duration(200)
              .call(this.zoom.transform, 
                  d3.zoomIdentity
                      .translate(transform.x, transform.y)
                      .scale(transform.k / 1.3));
      }
  }

  resetZoom() {
      if (this.svg && this.zoom) {
          this.svg.transition()
              .duration(200)
              .call(this.zoom.transform, d3.zoomIdentity);
      }
  }

  resetView() {
      this.resetSelection();
      this.resetZoom();
  }

  destroy() {
      if (this.simulation) {
          this.simulation.stop();
      }
      if (this.svg) {
          this.svg.remove();
      }
      window.removeEventListener('resize', this.handleResize.bind(this));
  }

  getNodeRadius(node) {
      // Slightly smaller base radii so labels feel larger relative to nodes
      const baseRadius = node.type === 'video' ? 9 :
                        node.type === 'tag' ? 7 : 5;
      const labelLength = nodeLabelLengthForLayout(node);
      // Keep some growth with label length but less aggressive to avoid huge circles
      return Math.max(baseRadius, labelLength * 1.4);
  }

  /**
   * Label font size scaled to graph width. Main (video) nodes use a larger range than tag/tail.
   */
  getLabelFontSizePx(node) {
      const w = Math.max(320, this.options.width || 800);
      const t = w * 0.024 + 8;
      const isVideo = node && node.type === 'video';
      if (isVideo) {
          const px = Math.round(Math.max(18, Math.min(30, t * 1.18 + 4)));
          return `${px}px`;
      }
      const px = Math.round(Math.max(15, Math.min(24, t)));
      return `${px}px`;
  }

  handleTagOverlayClick(tagLabel) {
    console.log('Tag overlay clicked:', tagLabel);
    // Dispatch custom event for tag click
    const event = new CustomEvent('tagClick', {
        detail: { tag: tagLabel }
    });
    document.dispatchEvent(event);
  }
}

// Update moveToTop function to be more explicit
function moveToTop(element) {
    const container = element.parentElement;
    const isTag = element.classList.contains('tag');
    container.insertBefore(element, container.firstChild);
    
    // Clear previous states based on element type
    if (isTag) {
        container.querySelectorAll('.tag').forEach(el => {
            el.classList.remove('top-position');
            el.style.pointerEvents = 'none';
        });
    } else {
        container.querySelectorAll('.tail-category').forEach(el => {
            el.classList.remove('top-position');
            el.style.pointerEvents = 'none';
        });
    }
    
    // Set new state
    element.classList.add('top-position');
    element.style.pointerEvents = 'auto';
}