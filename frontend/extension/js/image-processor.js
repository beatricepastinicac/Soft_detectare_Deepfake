class ImageProcessor {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.maxDimension = 512;
        this.quality = 0.8;
    }

    async processImageForAnalysis(imageUrl) {
        try {
            const img = await this.loadImage(imageUrl);
            const processedData = this.optimizeImage(img);
            return processedData;
        } catch (error) {
            throw new Error(`Image processing failed: ${error.message}`);
        }
    }

    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
    }

    optimizeImage(img) {
        const { width, height } = this.calculateDimensions(img.naturalWidth, img.naturalHeight);
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        this.ctx.drawImage(img, 0, 0, width, height);
        
        return this.canvas.toDataURL('image/jpeg', this.quality);
    }

    calculateDimensions(originalWidth, originalHeight) {
        if (originalWidth <= this.maxDimension && originalHeight <= this.maxDimension) {
            return { width: originalWidth, height: originalHeight };
        }

        const ratio = originalWidth / originalHeight;
        
        if (originalWidth > originalHeight) {
            return {
                width: this.maxDimension,
                height: Math.round(this.maxDimension / ratio)
            };
        } else {
            return {
                width: Math.round(this.maxDimension * ratio),
                height: this.maxDimension
            };
        }
    }

    extractImageFeatures(imageData) {
        const features = {
            size: this.getImageSize(imageData),
            format: this.getImageFormat(imageData),
            aspectRatio: this.getAspectRatio(imageData),
            compression: this.estimateCompression(imageData)
        };
        
        return features;
    }

    getImageSize(dataUrl) {
        const base64Data = dataUrl.split(',')[1];
        const binaryData = atob(base64Data);
        return binaryData.length;
    }

    getImageFormat(dataUrl) {
        const formatMatch = dataUrl.match(/^data:image\/([^;]+)/);
        return formatMatch ? formatMatch[1] : 'unknown';
    }

    getAspectRatio(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve(img.naturalWidth / img.naturalHeight);
            };
            img.src = dataUrl;
        });
    }

    estimateCompression(dataUrl) {
        const size = this.getImageSize(dataUrl);
        return size < 50000 ? 'high' : size < 200000 ? 'medium' : 'low';
    }

    async preprocessForDeepfakeDetection(imageUrl) {
        const img = await this.loadImage(imageUrl);
        
        const faceRegions = await this.detectFaces(img);
        
        if (faceRegions.length === 0) {
            return { 
                processedImage: this.optimizeImage(img),
                hasFaces: false,
                faceCount: 0
            };
        }

        const processedFaces = faceRegions.map(region => {
            return this.extractFaceRegion(img, region);
        });

        return {
            processedImage: this.optimizeImage(img),
            faces: processedFaces,
            hasFaces: true,
            faceCount: faceRegions.length
        };
    }

    async detectFaces(img) {
        this.canvas.width = img.naturalWidth;
        this.canvas.height = img.naturalHeight;
        this.ctx.drawImage(img, 0, 0);
        
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const faces = this.simpleHaarLikeFaceDetection(imageData);
        
        return faces;
    }

    simpleHaarLikeFaceDetection(imageData) {
        const faces = [];
        const { width, height, data } = imageData;
        
        const minFaceSize = Math.min(width, height) * 0.1;
        const maxFaceSize = Math.min(width, height) * 0.8;
        
        for (let size = minFaceSize; size <= maxFaceSize; size += 20) {
            for (let x = 0; x <= width - size; x += 10) {
                for (let y = 0; y <= height - size; y += 10) {
                    if (this.isFaceRegion(data, width, x, y, size)) {
                        faces.push({ x, y, width: size, height: size });
                    }
                }
            }
        }
        
        return this.mergeFaceRegions(faces);
    }

    isFaceRegion(data, imgWidth, x, y, size) {
        const eyeY = y + size * 0.3;
        const eyeLeftX = x + size * 0.3;
        const eyeRightX = x + size * 0.7;
        
        const leftEyeBrightness = this.getRegionBrightness(data, imgWidth, eyeLeftX, eyeY, size * 0.1);
        const rightEyeBrightness = this.getRegionBrightness(data, imgWidth, eyeRightX, eyeY, size * 0.1);
        const foreheadBrightness = this.getRegionBrightness(data, imgWidth, x + size * 0.5, y + size * 0.2, size * 0.2);
        
        return leftEyeBrightness < foreheadBrightness * 0.8 && 
               rightEyeBrightness < foreheadBrightness * 0.8;
    }

    getRegionBrightness(data, imgWidth, centerX, centerY, regionSize) {
        let totalBrightness = 0;
        let pixelCount = 0;
        
        const startX = Math.max(0, centerX - regionSize / 2);
        const endX = Math.min(imgWidth, centerX + regionSize / 2);
        const startY = Math.max(0, centerY - regionSize / 2);
        const endY = Math.min(data.length / (imgWidth * 4), centerY + regionSize / 2);
        
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                const index = (y * imgWidth + x) * 4;
                const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
                totalBrightness += brightness;
                pixelCount++;
            }
        }
        
        return pixelCount > 0 ? totalBrightness / pixelCount : 0;
    }

    mergeFaceRegions(faces) {
        const merged = [];
        
        faces.forEach(face => {
            let shouldAdd = true;
            
            for (let existing of merged) {
                const overlap = this.calculateOverlap(face, existing);
                if (overlap > 0.3) {
                    shouldAdd = false;
                    break;
                }
            }
            
            if (shouldAdd) {
                merged.push(face);
            }
        });
        
        return merged;
    }

    calculateOverlap(rect1, rect2) {
        const xOverlap = Math.max(0, Math.min(rect1.x + rect1.width, rect2.x + rect2.width) - Math.max(rect1.x, rect2.x));
        const yOverlap = Math.max(0, Math.min(rect1.y + rect1.height, rect2.y + rect2.height) - Math.max(rect1.y, rect2.y));
        const overlapArea = xOverlap * yOverlap;
        const totalArea = (rect1.width * rect1.height) + (rect2.width * rect2.height) - overlapArea;
        
        return overlapArea / totalArea;
    }

    extractFaceRegion(img, region) {
        const faceCanvas = document.createElement('canvas');
        const faceCtx = faceCanvas.getContext('2d');
        
        faceCanvas.width = region.width;
        faceCanvas.height = region.height;
        
        faceCtx.drawImage(
            img,
            region.x, region.y, region.width, region.height,
            0, 0, region.width, region.height
        );
        
        return faceCanvas.toDataURL('image/jpeg', this.quality);
    }

    async captureVideoFrame(videoElement) {
        if (videoElement.readyState < 2) {
            await new Promise(resolve => {
                videoElement.addEventListener('loadeddata', resolve, { once: true });
            });
        }
        
        this.canvas.width = videoElement.videoWidth;
        this.canvas.height = videoElement.videoHeight;
        
        this.ctx.drawImage(videoElement, 0, 0);
        
        return this.canvas.toDataURL('image/jpeg', this.quality);
    }

    generateImageHash(imageData) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 8;
        canvas.height = 8;
        
        const img = new Image();
        return new Promise((resolve) => {
            img.onload = () => {
                ctx.drawImage(img, 0, 0, 8, 8);
                const imageData = ctx.getImageData(0, 0, 8, 8);
                const hash = this.calculatePerceptualHash(imageData.data);
                resolve(hash);
            };
            img.src = imageData;
        });
    }

    calculatePerceptualHash(data) {
        let hash = '';
        let avgBrightness = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            avgBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        avgBrightness /= (data.length / 4);
        
        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            hash += brightness > avgBrightness ? '1' : '0';
        }
        
        return hash;
    }
}

if (typeof window !== 'undefined') {
    window.ImageProcessor = ImageProcessor;
}