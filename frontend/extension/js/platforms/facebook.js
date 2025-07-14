class FacebookAdapter {
    constructor() {
        this.selectors = {
            posts: '[data-pagelet="FeedUnit"]',
            images: [
                '.x1ey2m1c img',
                '[data-visualcompletion="media-vc-image"]',
                '.x85a59c img',
                'img[src*="scontent"]',
                'img.i09qtzwb',
                'img[data-imgperflogname]'
            ],
            videos: [
                'video',
                '.x1lliihq video',
                '[aria-label="Video"] video'
            ],
            stories: '[data-pagelet="Stories"]',
            profilePictures: '[data-visualcompletion="profile-photo"]'
        };
        
        this.processed = new Set();
        this.observer = null;
    }

    initialize() {
        this.scanExistingContent();
        this.setupObserver();
        console.log('Facebook adapter initialized');
    }

    scanExistingContent() {
        this.scanImages();
        this.scanVideos();
        this.scanStories();
    }

    scanImages() {
        this.selectors.images.forEach(selector => {
            try {
                const images = document.querySelectorAll(selector);
                images.forEach(img => this.processImage(img));
            } catch (error) {
                console.error(`Facebook adapter error with selector ${selector}:`, error);
            }
        });
    }

    scanVideos() {
        this.selectors.videos.forEach(selector => {
            try {
                const videos = document.querySelectorAll(selector);
                videos.forEach(video => this.processVideo(video));
            } catch (error) {
                console.error(`Facebook adapter error with video selector ${selector}:`, error);
            }
        });
    }

    scanStories() {
        try {
            const storyElements = document.querySelectorAll(`${this.selectors.stories} img`);
            storyElements.forEach(img => this.processStoryImage(img));
        } catch (error) {
            console.error('Facebook adapter error scanning stories:', error);
        }
    }

    processImage(img) {
        if (!this.isValidImage(img) || this.processed.has(img.src)) {
            return;
        }

        this.processed.add(img.src);
        
        const postContainer = this.findPostContainer(img);
        const imageType = this.determineImageType(img, postContainer);
        
        if (imageType === 'profile' || imageType === 'icon') {
            return;
        }

        this.addScanControls(img, imageType);
    }

    processVideo(video) {
        if (!this.isValidVideo(video)) {
            return;
        }

        const videoId = this.getVideoId(video);
        if (this.processed.has(videoId)) {
            return;
        }

        this.processed.add(videoId);
        this.addVideoScanControls(video);
    }

    processStoryImage(img) {
        if (!this.isValidImage(img)) {
            return;
        }

        const storyId = `story_${img.src}`;
        if (this.processed.has(storyId)) {
            return;
        }

        this.processed.add(storyId);
        this.addStoryScanControls(img);
    }

    isValidImage(img) {
        if (!img.src || img.src.startsWith('data:')) return false;
        
        const rect = img.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100) return false;
        
        if (img.src.includes('emoji') || img.src.includes('reaction')) return false;
        
        return img.complete && img.naturalHeight > 0;
    }

    isValidVideo(video) {
        const rect = video.getBoundingClientRect();
        return rect.width >= 200 && rect.height >= 150 && video.readyState >= 2;
    }

    determineImageType(img, postContainer) {
        if (this.isProfilePicture(img)) return 'profile';
        if (this.isPageIcon(img)) return 'icon';
        if (this.isPostImage(img, postContainer)) return 'post';
        if (this.isStoryImage(img)) return 'story';
        return 'general';
    }

    isProfilePicture(img) {
        return img.closest('[data-visualcompletion="profile-photo"]') !== null ||
               img.src.includes('profile') ||
               img.getAttribute('alt')?.includes('profile picture');
    }

    isPageIcon(img) {
        const rect = img.getBoundingClientRect();
        return rect.width <= 60 && rect.height <= 60;
    }

    isPostImage(img, postContainer) {
        return postContainer !== null && 
               img.closest('[data-visualcompletion="media-vc-image"]') !== null;
    }

    isStoryImage(img) {
        return img.closest('[data-pagelet="Stories"]') !== null;
    }

    findPostContainer(img) {
        return img.closest('[data-pagelet="FeedUnit"]') || 
               img.closest('[role="article"]') ||
               img.closest('[data-testid="post"]');
    }

    getVideoId(video) {
        return video.src || 
               video.getAttribute('data-video-id') ||
               `video_${Date.now()}_${Math.random()}`;
    }

    addScanControls(img, imageType) {
        const parent = this.getControlsParent(img);
        if (!parent) return;

        const controls = this.createScanControls(imageType);
        controls.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.scanImage(img, imageType);
            controls.remove();
        });

        parent.appendChild(controls);
    }

    addVideoScanControls(video) {
        const parent = this.getControlsParent(video);
        if (!parent) return;

        const controls = this.createVideoScanControls();
        controls.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.scanVideo(video);
            controls.remove();
        });

        parent.appendChild(controls);
    }

    addStoryScanControls(img) {
        const storyContainer = img.closest('[data-pagelet="Stories"]');
        if (!storyContainer) return;

        const controls = this.createStoryScanControls();
        controls.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.scanStoryImage(img);
            controls.remove();
        });

        storyContainer.appendChild(controls);
    }

    getControlsParent(element) {
        let parent = element.parentNode;
        while (parent) {
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

    createScanControls(imageType) {
        const container = document.createElement('div');
        container.className = 'facebook-deepfake-scan';
        container.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            z-index: 10000;
        `;

        const button = document.createElement('button');
        button.style.cssText = `
            background: rgba(24, 119, 242, 0.9);
            color: white;
            border: none;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: background-color 0.2s;
        `;

        button.innerHTML = `
            <span>🔍</span>
            <span>Verifică</span>
        `;

        button.addEventListener('mouseover', () => {
            button.style.background = 'rgba(24, 119, 242, 1)';
        });

        button.addEventListener('mouseout', () => {
            button.style.background = 'rgba(24, 119, 242, 0.9)';
        });

        container.appendChild(button);
        return container;
    }

    createVideoScanControls() {
        const container = document.createElement('div');
        container.className = 'facebook-deepfake-video-scan';
        container.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            z-index: 10000;
        `;

        const button = document.createElement('button');
        button.style.cssText = `
            background: rgba(220, 53, 69, 0.9);
            color: white;
            border: none;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        button.innerHTML = `
            <span>🎥</span>
            <span>Scanează</span>
        `;

        container.appendChild(button);
        return container;
    }

    createStoryScanControls() {
        const container = document.createElement('div');
        container.className = 'facebook-story-scan';
        container.style.cssText = `
            position: absolute;
            bottom: 8px;
            right: 8px;
            z-index: 10000;
        `;

        const button = document.createElement('button');
        button.style.cssText = `
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: none;
            border-radius: 20px;
            padding: 8px;
            font-size: 10px;
            cursor: pointer;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        button.innerHTML = '🔍';
        container.appendChild(button);
        return container;
    }

    scanImage(img, imageType) {
        if (window.deepfakeDetector) {
            window.deepfakeDetector.scanImage(img.src, {
                platform: 'facebook',
                type: imageType,
                element: img
            });
        }
    }

    scanVideo(video) {
        if (window.deepfakeDetector && window.deepfakeDetector.scanVideo) {
            window.deepfakeDetector.scanVideo(video, {
                platform: 'facebook',
                type: 'video'
            });
        }
    }

    scanStoryImage(img) {
        if (window.deepfakeDetector) {
            window.deepfakeDetector.scanImage(img.src, {
                platform: 'facebook',
                type: 'story',
                element: img
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

    scanNewContent(node) {
        if (node.tagName === 'IMG') {
            this.processImage(node);
        } else if (node.tagName === 'VIDEO') {
            this.processVideo(node);
        } else if (node.querySelectorAll) {
            this.selectors.images.forEach(selector => {
                try {
                    const images = node.querySelectorAll(selector);
                    images.forEach(img => this.processImage(img));
                } catch (error) {
                    console.error(`Facebook adapter error with new content selector ${selector}:`, error);
                }
            });

            this.selectors.videos.forEach(selector => {
                try {
                    const videos = node.querySelectorAll(selector);
                    videos.forEach(video => this.processVideo(video));
                } catch (error) {
                    console.error(`Facebook adapter error with new video selector ${selector}:`, error);
                }
            });
        }
    }

    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        
        document.querySelectorAll('.facebook-deepfake-scan, .facebook-deepfake-video-scan, .facebook-story-scan')
            .forEach(el => el.remove());
        
        this.processed.clear();
    }
}

if (typeof window !== 'undefined') {
    window.FacebookAdapter = FacebookAdapter;
}