// src/scripts/NetworkGraph.js
import * as d3 from 'd3';

const COLORS = {
    NODE_VIDEO: '#2C3E50',
    NODE_TAG: '#3498DB',
    NODE_TAIL: '#E74C3C',
    LINK_VIDEO_TAG: '#95A5A6',
    LINK_VIDEO_TAIL: '#E74C3C'
};

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
        this.linkElements = null;
        this.nodeElements = null;
        this.markers = [];
        this.dataProcessor = null;

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
                .attr('class', 'network-graph-svg');

            this.zoom = d3.zoom()
                .scaleExtent([0.5, 3])
                .on('zoom', (event) => {
                    // Zoom and pan the entire graph container without hiding elements
                    this.graphContainer.attr('transform', event.transform);
                });

            this.svg.call(this.zoom);

            this.graphContainer = this.svg
                .append('g')
                .attr('class', 'graph-container')
                .attr('transform', `translate(${this.options.width / 2},${this.options.height / 2})`);

            this.simulation = d3.forceSimulation()
                .force("link", d3.forceLink()
                    .id(d => d.id)
                    .distance(d => {
                        // Increase distance based on label lengths
                        const sourceLength = d.source.label ? d.source.label.length : 0;
                        const targetLength = d.target.label ? d.target.label.length : 0;
                        return Math.max(100, (sourceLength + targetLength) * 5);
                    })
                )
                .force("charge", d3.forceManyBody()
                    .strength(d => {
                        // Adjust repulsion force based on node type
                        switch(d.type) {
                            case 'video': return -1000;
                            case 'tag': return -800;
                            case 'tail': return -500;
                            default: return -700;
                        }
                    })
                    .distanceMin(200)
                    .distanceMax(1000)
                )
                .force("collide", d3.forceCollide()
                    .radius(d => {
                        // Adjust collision radius based on label length and node type
                        const baseRadius = this.getNodeRadius(d);
                        const labelLength = d.label ? d.label.length : 0;
                        return baseRadius + labelLength * 4;
                    })
                    .strength(1)
                    .iterations(3)
                )
                .force("center", d3.forceCenter(0, 0))
                .force("x", d3.forceX()
                    .strength(0.1)
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
                    .strength(0.1)
                    .y(0)
                );

            this.initializeMap();
            window.addEventListener('resize', this.handleResize.bind(this));

            // Add background click handler
            this.svg.on('click', (event) => {
                if (event.target === this.svg.node()) {
                    this.selectedNode = null;
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

                resetBtn.addEventListener('click', () => {
                    this.svg.transition()
                        .duration(200)
                        .call(this.zoom.transform, d3.zoomIdentity);
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

        this.simulation.alpha(0.3).restart();
    }

    setData(nodes, links, dataProcessor) {
        this.dataProcessor = dataProcessor;
        this.nodes = nodes;
        this.links = links;
        this.originalNodes = [...nodes];
        this.originalLinks = [...links];
        this.updateVisualization();
    }

    updateVisualization() {
        console.log('NetworkGraph: updateVisualization called');
        console.log('NetworkGraph: Nodes count:', this.nodes.length);
        console.log('NetworkGraph: Links count:', this.links.length);
        console.log('NetworkGraph: Sample nodes:', this.nodes.slice(0, 3));
        
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
            .style('stroke', d => {
                if (d.type === 'video-tail') {
                    return COLORS.LINK_VIDEO_TAIL;
                }
                return COLORS.LINK_VIDEO_TAG;
            })
            .style('stroke-width', 1.5)
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
                    case 'video': return COLORS.NODE_VIDEO;
                    case 'tag': return COLORS.NODE_TAG;
                    case 'tail': return COLORS.NODE_TAIL;
                    default: return COLORS.NODE_VIDEO;
                }
            });

        // Add labels to node groups
        this.labelElements = nodeGroups
            .append('text')
            .attr('class', 'node-label')
            .attr('dx', d => this.getNodeRadius(d) + 4)
            .attr('dy', '.32em')
            .text(d => d.label)
            .style('font-size', '14px')
            .style('fill', '#333')
            .style('pointer-events', 'none')
            .style('paint-order', 'stroke')
            .style('stroke', '#ffffff')
            .style('stroke-width', 0.75)
            .style('stroke-linejoin', 'round');

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

            nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Restart simulation
        this.simulation.alpha(1).restart();
    }

    handleNodeClick(node) {
        console.log('NetworkGraph: handleNodeClick called with node:', node);
        if (node.type === 'video') {
            console.log("Selected node data:", node);
            console.log("Node tails:", node.data?.tails);
            
            // Always treat each click as a fresh selection so panels and tags update reliably
            this.selectedNode = node;

            // Get all nodes and links that should be visible
            const visibleNodes = new Set([node.id]);
            const visibleLinks = new Set();

            // Add connected tag nodes and their links
            this.links.forEach(link => {
                if ((link.source.id === node.id || link.source === node.id) && link.type === 'video-tag') {
                    visibleNodes.add(link.target.id || link.target);
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

            // Update the visualization with new nodes and links
            this.updateVisualization();

            // After updating, hide non-visible elements
            this.graphContainer.selectAll('.node-group')
                .style('opacity', d => visibleNodes.has(d.id) ? 1 : 0.5)
                .style('display', null);

            this.graphContainer.selectAll('.link')
                .style('opacity', d => {
                    const isVisible = visibleLinks.has(d) || 
                        (d.source.id === node.id && (d.type === 'video-tag' || d.type === 'video-tail'));
                    return isVisible ? 1 : 0.4;
                })
                .style('display', null);

            // Dispatch the node selection event
            console.log('NetworkGraph: Dispatching nodeSelected event');
            const event = new CustomEvent('nodeSelected', { 
                detail: { node: node }
            });
            document.dispatchEvent(event);
            console.log('NetworkGraph: nodeSelected event dispatched');
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
        }
    }

    handleTagNodeClick(tagNode) {
        console.log("Tag node clicked:", tagNode);
        
        const visibleNodes = new Set([tagNode.id]);
        const visibleLinks = new Set();

        // Find all videos connected to this tag
        this.links.forEach(link => {
            if (link.type === 'video-tag') {
                const targetId = link.target.id || link.target;
                const sourceId = link.source.id || link.source;
                
                // If this link connects to our selected tag
                if (targetId === tagNode.id || sourceId === tagNode.id) {
                    const videoNode = this.nodes.find(n => 
                        n.id === (targetId === tagNode.id ? sourceId : targetId)
                    );
                    
                    if (videoNode && videoNode.type === 'video') {
                        visibleNodes.add(videoNode.id);
                        visibleLinks.add(link);
                    }
                }
            }
        });

        // Fade non-related nodes and links instead of hiding them completely
        this.graphContainer.selectAll('.node-group')
            .style('opacity', d => visibleNodes.has(d.id) ? 1 : 0.5)
            .style('display', null);

        this.graphContainer.selectAll('.link')
            .style('opacity', d => visibleLinks.has(d) ? 1 : 0.4)
            .style('display', null);

        console.log("Visible nodes:", visibleNodes);
        console.log("Visible links:", visibleLinks);
    }

    resetVisualization() {
        if (this.selectedNode && !this.selectedTag) {
            // If there's a selected video node and no selected tag, return to video view
            this.handleNodeClick(this.selectedNode);
        } else {
            // Reset to show all nodes except tails
            this.selectedNode = null;
            this.selectedTag = null;
            
            this.nodes = this.originalNodes.filter(node => node.type !== 'tail');
            this.links = this.originalLinks.filter(link => link.type !== 'video-tail');

            this.graphContainer.selectAll('.link')
                .style('opacity', 0.6)
                .style('display', null);

            this.graphContainer.selectAll('.node-group')
                .style('opacity', 1)
                .style('display', null);

            this.updateVisualization();
            this.simulation.alpha(0.3).restart();
        }
    }

    showAllNodes() {
        this.nodes = this.nodes.filter(node => node.type !== 'tail');
        this.links = this.links.filter(link => link.type !== 'video-tail');

        this.graphContainer.selectAll('.link')
            .style('opacity', 0.6)
            .style('display', null);

        this.graphContainer.selectAll('.node-group')
            .style('opacity', 1)
            .style('display', null);

        this.updateVisualization();
        this.simulation.alpha(0.3).restart();
    }

    getNodeColor(node) {
        const colors = {
            video: 'var(--color-accent)',
            tag: 'var(--color-secondary)',
            place: 'var(--color-primary)',
            tail: 'var(--color-node)'
        };
        return colors[node.type] || this.options.nodeColor;
    }

    dragBehavior() {
        return d3.drag()
            .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
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
        if (!this.nodeElements || !this.linkElements) return;

        // Handle tail node hover
        if (d.type === 'tail') {
            const event = new CustomEvent('tailNodeHover', { 
                detail: { tail: d.label }
            });
            document.dispatchEvent(event);
        }
        // Add tag node hover handling
        else if (d.type === 'tag') {
            const event = new CustomEvent('tagNodeHover', { 
                detail: { tag: d.label }
            });
            document.dispatchEvent(event);
        }

        const connectedNodeIds = this.links
            .filter(link => link.source.id === d.id || link.target.id === d.id)
            .flatMap(link => [link.source.id, link.target.id]);

        this.nodeElements
            .style('opacity', node => connectedNodeIds.includes(node.id) ? 1 : 0.5);

        this.linkElements
            .style('opacity', link =>
                link.source.id === d.id || link.target.id === d.id
                    ? 'var(--opacity-link)'
                    : 'var(--opacity-link-faded)')
            .style('stroke', link => 
                link.source.id === d.id || link.target.id === d.id
                    ? 'var(--color-edge-highlighted)'
                    : 'var(--color-edge)');
    }

    handleNodeUnhover() {
      if (!this.nodeElements || !this.linkElements || this.selectedNode) return;

      this.nodeElements.style('opacity', 1);
      this.linkElements.style('opacity', 1).style('stroke', 'var(--color-edge)');
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
      const labelLength = node.label ? node.label.length : 0;
      // Keep some growth with label length but less aggressive to avoid huge circles
      return Math.max(baseRadius, labelLength * 1.4);
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