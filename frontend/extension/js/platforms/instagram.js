class InstagramAdapter {
    constructor() {
        this.selectors = {
            posts: 'article',
            images: [
                'article img',
                '._aagt',
                'img._aa63',
                'img[src*="cdninstagram"]',
                'img[data-testid="post-image"]',
                '._7UhW9 img',
                '._9AhH0 img'
            ],
            videos: [
                'video',
                '._aagu video',
                'video._ab1d'
            ],
            stories: [
                '._7UhW9',
                '[data-testid="story-viewer-image"]',
                '._ac0a img'
            ],
            reels: [
                '[data-testid="reel-item"]',
                '._ac7v video'
            ]
        };
        
        this.processed = new Set();
        this.observer = null;
        this.isStoriesView = false;
    }

    initialize() {
        this.detectView();
        this.scanExistingContent();
        this.setupObserver();
        this.setupStoriesDetection();
        console.log('Instagram adapter initialized');
    }

    detectView() {
        this.isStoriesView = window.location.pathname.includes('/stories/');
    }

    scanExistingContent() {
        if (this.isStoriesView) {
            this.scanStories();
        } else {
            this.scanFeedContent();
            this.scanReels();
        }
    }

    scanFeedContent() {
        this.selectors.images.forEach(selector => {
            try {
                const images = document.querySelectorAll(selector);
                images.forEach(img => this.processImage(img, 'feed'));
            } catch (error) {
                console.error(`Instagram adapter error with selector ${selector}:`, error);
            }
        });

        this.selectors.videos.forEach(selector => {
            try {
                const videos = document.querySelectorAll(selector);
                videos.forEach(video => this.processVideo(video, 'feed'));
            } catch (error) {
                console.error(`Instagram adapter error with video selector ${selector}:`, error);
            }
        });
    }

    scanStories() {
        this.selectors.stories.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
                    const video = el.querySelector('video');
                    
                    if (img) this.processImage(img, 'story');
                    if (video) this.processVideo(video, 'story');
                });
            } catch (error) {
                console.error(`Instagram stories error with selector ${selector}:`, error);
            }
        });
    }

    scanReels() {
        this.selectors.reels.forEach(selector => {
            try {
                const reels = document.querySelectorAll(selector);
                reels.forEach(reel => {
                    const video = reel.querySelector('video');
                    if (video) this.processVideo(video, 'reel');
                });
            } catch (error) {
                console.error(`Instagram reels error with selector ${selector}:`, error);
            }
        });
    }

    processImage(img, contentType) {
        if (!this.isValidImage(img) || this.processed.has(img.src)) {
            return;
        }

        this.processed.add(img.src);
        
        if (this.isProfilePicture(img) || this.isIcon(img)) {
            return;
        }

        this.addImageScanControls(img, contentType);
    }

    processVideo(video, contentType) {
        if (!this.isValidVideo(video)) {
            return;
        }

        const videoId = this.getVideoId(video);
        if (this.processed.has(videoId)) {
            return;
        }

        this.processed.add(videoId);
        this.addVideoScanControls(video, contentType);
    }

    isValidImage(img) {
        if (!img.src || img.src.startsWith('data:')) return false;
        
        const rect = img.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100) return false;
        
        if (img.src.includes('emoji') || img.src.includes('static')) return false;
        
        return img.complete && img.naturalHeight > 0;
    }

    isValidVideo(video) {
        const rect = video.getBoundingClientRect();
        return rect.width >= 200 && rect.height >= 200 && video.readyState >= 2;
    }

    isProfilePicture(img) {
        return img.closest('._6q-tv') !== null ||
               img.closest('[data-testid="user-avatar"]') !== null ||
               img.src.includes('profile_pic') ||
               img.getAttribute('alt')?.toLowerCase().includes('profile picture');
    }

    isIcon(img) {
        const rect = img.getBoundingClientRect();
        return rect.width <= 50 && rect.height <= 50;
    }

    getVideoId(video) {
        return video.src || 
               video.getAttribute('data-video-id') ||
               `ig_video_${Date.now()}_${Math.random()}`;
    }

    addImageScanControls(img, contentType) {
        const parent = this.findControlsParent(img, contentType);
        if (!parent) return;

        const controls = this.createImageScanControls(contentType);
        controls.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.scanImage(img, contentType);
            controls.remove();
        });

        parent.appendChild(controls);
    }

    addVideoScanControls(video, contentType) {
        const parent = this.findControlsParent(video, contentType);
        if (!parent) return;

        const controls = this.createVideoScanControls(contentType);
        controls.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.scanVideo(video, contentType);
            controls.remove();
        });

        parent.appendChild(controls);
    }

    findControlsParent(element, contentType) {
        if (contentType === 'story') {
            return element.closest('[data-testid="story-viewer"]') || 
                   element.closest('._7UhW9') ||
                   this.makeParentRelative(element);
        }

        if (contentType === 'reel') {
            return element.closest('[data-testid="reel-item"]') ||
                   element.closest('._ac7v') ||
                   this.makeParentRelative(element);
        }

        return element.closest('article') || this.makeParentRelative(element);
    }

    makeParentRelative(element) {
        let parent = element.parentNode;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            if (style.position === 'relative' || style.position === 'absolute') {
                return parent;
            }
            parent = parent.parentNode;
        }
        
        if (element.parentNode) {
            element.parentNode.style.position = 'relative';
            return element.parentNode;
        }
        
        return null;
    }

    createImageScanControls(contentType) {
        const container = document.createElement('div');
        container.className = `instagram-scan-${contentType}`;
        
        const baseStyles = `
            position: absolute;
            z-index: 10000;
            cursor: pointer;
        `;

        if (contentType === 'story') {
            container.style.cssText = baseStyles + `
                bottom: 16px;
                right: 16px;
            `;
        } else {
            container.style.cssText = baseStyles + `
                top: 12px;
                right: 12px;
            `;
        }

        const button = document.createElement('button');
        button.style.cssText = `
            background: ${this.getButtonColor(contentType)};
            color: white;
            border: none;
            border-radius: ${contentType === 'story' ? '50%' : '8px'};
            padding: ${contentType === 'story' ? '8px' : '8px 12px'};
            font-size: ${contentType === 'story' ? '14px' : '12px'};
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: all 0.2s;
            ${contentType === 'story' ? 'width: 36px; height: 36px; justify-content: center;' : ''}
        `;

        if (contentType === 'story') {
            button.innerHTML = '🔍';
        } else {
            button.innerHTML = `<span>🔍</span><span>Verifică</span>`;
        }

        button.addEventListener('mouseover', () => {
            button.style.transform = 'scale(1.05)';
            button.style.opacity = '1';
        });

        button.addEventListener('mouseout', () => {
            button.style.transform = 'scale(1)';
            button.style.opacity = '0.9';
        });

        container.appendChild(button);
        return container;
    }

    createVideoScanControls(contentType) {
        const container = document.createElement('div');
        container.className = `instagram-video-scan-${contentType}`;
        
        container.style.cssText = `
            position: absolute;
            top: 12px;
            right: 12px;
            z-index: 10000;
        `;

        const button = document.createElement('button');
        button.style.cssText = `
            background: ${this.getButtonColor(contentType, true)};
            color: white;
            border: none;
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        button.innerHTML = `<span>🎥</span><span>Scanează</span>`;
        container.appendChild(button);
        return container;
    }

    getButtonColor(contentType, isVideo = false) {
        if (isVideo) {
            return 'rgba(220, 53, 69, 0.9)';
        }

        switch (contentType) {
            case 'story':
                return 'rgba(0, 0, 0, 0.7)';
            case 'reel':
                return 'rgba(142, 36, 170, 0.9)';
            default:
                return 'rgba(225, 48, 108, 0.9)';
        }
    }

    scanImage(img, contentType) {
        if (window.deepfakeDetector) {
            window.deepfakeDetector.scanImage(img.src, {
                platform: 'instagram',
                type: contentType,
                element: img
            });
        }
    }

    scanVideo(video, contentType) {
        if (window.deepfakeDetector && window.deepfakeDetector.scanVideo) {
            window.deepfakeDetector.scanVideo(video, {
                platform: 'instagram',
                type: contentType
            });
        }
    }

    setupObserver() {
        if (this.observer) {
            this.observer.disconnect();
        }

        this.observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        this.scanNewContent(node);
                    }
                });
            });
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    setupStoriesDetection() {
        let currentPath = window.location.pathname;
        
        setInterval(() => {
            if (window.location.pathname !== currentPath) {
                currentPath = window.location.pathname;
                this.detectView();
                
                setTimeout(() => {
                    this.scanExistingContent();
                }, 1000);
            }
        }, 500);
    }

    scanNewContent(node) {
        if (node.tagName === 'IMG') {
            const contentType = this.isStoriesView ? 'story' : 'feed';
            this.processImage(node, contentType);
        } else if (node.tagName === 'VIDEO') {
            const contentType = this.determineVideoType(node);
            this.processVideo(node, contentType);
        } else if (node.querySelectorAll) {
            const contentType = this.isStoriesView ? 'story' : 'feed';
            
            this.selectors.images.forEach(selector => {
                try {
                    const images = node.querySelectorAll(selector);
                    images.forEach(img => this.processImage(img, contentType));
                } catch (error) {
                    console.error(`Instagram adapter error with new content selector ${selector}:`, error);
                }
            });

            this.selectors.videos.forEach(selector => {
                try {
                    const videos = node.querySelectorAll(selector);
                    videos.forEach(video => {
                        const videoType = this.determineVideoType(video);
                        this.processVideo(video, videoType);
                    });
                } catch (error) {
                    console.error(`Instagram adapter error with new video selector ${selector}:`, error);
                }
            });
        }
    }

    determineVideoType(video) {
        if (this.isStoriesView) return 'story';
        if (video.closest('[data-testid="reel-item"]')) return 'reel';
        return 'feed';
    }

    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        
        document.querySelectorAll('[class^="instagram-scan-"], [class^="instagram-video-scan-"]')
            .forEach(el => el.remove());
        
        this.processed.clear();
    }
}

if (typeof window !== 'undefined') {
    window.InstagramAdapter = InstagramAdapter;
}