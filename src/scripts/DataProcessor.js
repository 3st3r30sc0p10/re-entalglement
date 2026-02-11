// src/scripts/DataProcessor.js

export class DataProcessor {
  constructor(rawData) {
      this.rawData = rawData;
      this.allNodes = [];
      this.allLinks = [];
      this.tailNodes = new Map();
      this.tailLinks = [];
  }
  
  processData() {
      console.log("Raw data in processData:", this.rawData);
      const nodes = [];
      const links = [];
      const tagNodes = new Map();
      this.tailNodes = new Map();
      this.tailLinks = [];
      
      // Process videos and create nodes
      this.rawData.forEach(video => {
          // Add video node with complete data
          const videoNode = {
              id: video.id,
              label: video.title,
              type: 'video',
              data: {
                  ...video,  // Include all video data
                  tails: video.tails || []  // Ensure tails are included
              }
          };
          nodes.push(videoNode);
          
          // Process tags
          video.tags?.forEach(tag => {
              if (!tagNodes.has(tag)) {
                  const tagNode = {
                      id: `tag-${tag}`,
                      label: tag,
                      type: 'tag'
                  };
                  nodes.push(tagNode);
                  tagNodes.set(tag, tagNode);
              }
              
              links.push({
                  source: videoNode,
                  target: tagNodes.get(tag),
                  type: 'video-tag'
              });
          });
          
          // Process tails
          video.tails?.forEach(tail => {
              if (!this.tailNodes.has(tail)) {
                  const tailNode = {
                      id: `tail-${tail}`,
                      label: tail,
                      type: 'tail'
                  };
                  this.tailNodes.set(tail, tailNode);
              }
              
              this.tailLinks.push({
                  source: videoNode,
                  target: this.tailNodes.get(tail),
                  type: 'video-tail'
              });
          });
      });
      
      this.allNodes = [...nodes, ...Array.from(this.tailNodes.values())];
      this.allLinks = [...links, ...this.tailLinks];
      
      return { 
          nodes, 
          links,
          tailNodes: this.tailNodes,
          tailLinks: this.tailLinks
      };
  }
  
  getTailsForVideo(videoId) {
      // Find the video data in the raw data
      const videoData = this.rawData.find(video => video.id === videoId);
      
      if (!videoData || !videoData.tails) {
          console.log("No tails found for video:", videoId);
          return { nodes: [], links: [] };
      }

      console.log("Found tails for video:", videoData.tails);
      
      const tailNodesForVideo = new Set();
      const tailLinksForVideo = [];
      const videoNode = this.allNodes.find(node => node.id === videoId);
      
      videoData.tails.forEach(tail => {
          const tailNode = {
              id: `tail-${tail}`,
              label: tail,
              type: 'tail'
          };
          tailNodesForVideo.add(tailNode);
          
          tailLinksForVideo.push({
              source: videoNode,
              target: tailNode,
              type: 'video-tail'
          });
      });
      
      return {
          nodes: Array.from(tailNodesForVideo),
          links: tailLinksForVideo
      };
  }
}