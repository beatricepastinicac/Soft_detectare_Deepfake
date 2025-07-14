class QueueManager {
    constructor() {
        this.queues = {
            high: [],
            medium: [],
            low: []
        };
        this.processing = false;
        this.maxConcurrent = 3;
        this.currentlyProcessing = 0;
        this.processingDelay = 2000;
        this.retryAttempts = 2;
        this.stats = {
            processed: 0,
            failed: 0,
            queued: 0
        };
    }

    addToQueue(item, priority = 'medium') {
        const queueItem = {
            id: this.generateItemId(item),
            data: item,
            priority: priority,
            timestamp: Date.now(),
            retries: 0,
            status: 'queued'
        };

        if (this.isDuplicate(queueItem.id)) {
            return false;
        }

        this.queues[priority].push(queueItem);
        this.stats.queued++;
        
        this.processQueue();
        return true;
    }

    generateItemId(item) {
        const dataString = item.imageData || item.url || JSON.stringify(item);
        return btoa(dataString.substring(0, 50)).substring(0, 16);
    }

    isDuplicate(itemId) {
        for (const priority in this.queues) {
            if (this.queues[priority].some(item => item.id === itemId)) {
                return true;
            }
        }
        return false;
    }

    async processQueue() {
        if (this.processing || this.currentlyProcessing >= this.maxConcurrent) {
            return;
        }

        this.processing = true;

        while (this.hasItemsToProcess() && this.currentlyProcessing < this.maxConcurrent) {
            const item = this.getNextItem();
            if (item) {
                this.processItem(item);
            }
        }

        this.processing = false;
    }

    hasItemsToProcess() {
        return this.queues.high.length > 0 || 
               this.queues.medium.length > 0 || 
               this.queues.low.length > 0;
    }

    getNextItem() {
        if (this.queues.high.length > 0) {
            return this.queues.high.shift();
        }
        if (this.queues.medium.length > 0) {
            return this.queues.medium.shift();
        }
        if (this.queues.low.length > 0) {
            return this.queues.low.shift();
        }
        return null;
    }

    async processItem(item) {
        this.currentlyProcessing++;
        item.status = 'processing';
        this.stats.queued--;

        try {
            await this.executeItemProcessing(item);
            this.stats.processed++;
            item.status = 'completed';
        } catch (error) {
            await this.handleItemError(item, error);
        } finally {
            this.currentlyProcessing--;
            setTimeout(() => this.processQueue(), this.processingDelay);
        }
    }

    async executeItemProcessing(item) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'ANALYZE_IMAGE',
                imageData: item.data.imageData,
                priority: item.priority,
                metadata: {
                    itemId: item.id,
                    tabId: item.data.tabId,
                    timestamp: item.timestamp
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }

    async handleItemError(item, error) {
        item.retries++;
        
        if (item.retries <= this.retryAttempts) {
            const retryDelay = Math.pow(2, item.retries) * 1000;
            setTimeout(() => {
                this.queues[item.priority].unshift(item);
                this.stats.queued++;
                this.processQueue();
            }, retryDelay);
        } else {
            this.stats.failed++;
            item.status = 'failed';
            item.error = error.message;
            console.error(`QueueManager: Failed to process item ${item.id}:`, error);
        }
    }

    getQueueStatus() {
        const totalQueued = this.queues.high.length + this.queues.medium.length + this.queues.low.length;
        
        return {
            totalQueued: totalQueued,
            highPriority: this.queues.high.length,
            mediumPriority: this.queues.medium.length,
            lowPriority: this.queues.low.length,
            processing: this.currentlyProcessing,
            stats: this.stats
        };
    }

    clearQueue(priority = null) {
        if (priority && this.queues[priority]) {
            const cleared = this.queues[priority].length;
            this.queues[priority] = [];
            this.stats.queued -= cleared;
        } else {
            const totalCleared = this.queues.high.length + this.queues.medium.length + this.queues.low.length;
            this.queues.high = [];
            this.queues.medium = [];
            this.queues.low = [];
            this.stats.queued = 0;
        }
    }

    pauseProcessing() {
        this.processing = true;
    }

    resumeProcessing() {
        this.processing = false;
        this.processQueue();
    }

    updateProcessingDelay(newDelay) {
        this.processingDelay = Math.max(500, newDelay);
    }

    updateMaxConcurrent(newMax) {
        this.maxConcurrent = Math.max(1, Math.min(10, newMax));
    }

    removeFromQueue(itemId) {
        for (const priority in this.queues) {
            const index = this.queues[priority].findIndex(item => item.id === itemId);
            if (index !== -1) {
                this.queues[priority].splice(index, 1);
                this.stats.queued--;
                return true;
            }
        }
        return false;
    }

    getQueueItems(priority = null) {
        if (priority && this.queues[priority]) {
            return [...this.queues[priority]];
        }
        
        return {
            high: [...this.queues.high],
            medium: [...this.queues.medium],
            low: [...this.queues.low]
        };
    }

    prioritizeItem(itemId, newPriority) {
        for (const priority in this.queues) {
            const index = this.queues[priority].findIndex(item => item.id === itemId);
            if (index !== -1) {
                const item = this.queues[priority].splice(index, 1)[0];
                item.priority = newPriority;
                this.queues[newPriority].unshift(item);
                return true;
            }
        }
        return false;
    }

    resetStats() {
        this.stats = {
            processed: 0,
            failed: 0,
            queued: this.queues.high.length + this.queues.medium.length + this.queues.low.length
        };
    }

    getEstimatedWaitTime(priority = 'medium') {
        let itemsAhead = 0;
        
        if (priority === 'low') {
            itemsAhead = this.queues.high.length + this.queues.medium.length + this.queues.low.length;
        } else if (priority === 'medium') {
            itemsAhead = this.queues.high.length + this.queues.medium.length;
        } else {
            itemsAhead = this.queues.high.length;
        }
        
        const avgProcessingTime = this.processingDelay + 3000;
        const parallelProcessing = Math.min(this.maxConcurrent, itemsAhead);
        
        return parallelProcessing > 0 ? (itemsAhead / parallelProcessing) * avgProcessingTime : 0;
    }

    schedulePeriodicProcessing(interval = 30000) {
        setInterval(() => {
            if (this.hasItemsToProcess() && !this.processing) {
                this.processQueue();
            }
        }, interval);
    }
}

if (typeof window !== 'undefined') {
    window.QueueManager = QueueManager;
}