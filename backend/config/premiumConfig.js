/**
 * Premium Features Configuration
 * Centralized configuration for premium functionality
 */

const premiumConfig = {
  // Feature flags
  features: {
    multiLayerAnalysis: true,
    highResolutionProcessing: true,
    advancedPreprocessing: true,
    enhancedVisualization: true,
    detailedStatistics: true,
    priorityProcessing: true,
    unlimitedAnalyses: true,
    pdfReports: true,
    videoProcessing: true,
    faceAnalysis: true,
    historySaving: true,
    apiAccess: true
  },

  // Processing settings
  processing: {
    free: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      imageResolution: 224,
      maxAnalysesPerDay: 5,
      supportedFormats: ['jpg', 'jpeg', 'png'],
      heatmapEnabled: false,
      processingTimeout: 30000 // 30 seconds
    },
    premium: {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      imageResolution: 512,
      maxAnalysesPerDay: -1, // unlimited
      supportedFormats: ['jpg', 'jpeg', 'png', 'mp4', 'avi', 'mov', 'mkv'],
      heatmapEnabled: true,
      processingTimeout: 120000 // 2 minutes
    }
  },

  // Model settings
  models: {
    free: {
      modelType: 'basic',
      layers: ['final_layer'],
      confidence: 'basic'
    },
    premium: {
      modelType: 'advanced',
      layers: ['conv2d_3', 'conv2d_4', 'conv2d_5', 'dense_1'],
      confidence: 'advanced',
      multiLayerAnalysis: true
    }
  },

  // UI settings
  ui: {
    free: {
      showPremiumPrompts: true,
      maxResultsShown: 5,
      exportFormats: ['json']
    },
    premium: {
      showPremiumBadges: true,
      maxResultsShown: -1, // unlimited
      exportFormats: ['json', 'pdf', 'csv'],
      advancedStats: true,
      heatmapVisualization: true
    }
  },

  // Statistics tracking
  analytics: {
    trackUsage: true,
    trackPerformance: true,
    generateReports: {
      daily: true,
      weekly: true,
      monthly: true
    }
  },

  // File paths
  paths: {
    heatmapsOutput: '../heatmaps/',
    reportsOutput: '../exports/',
    logsOutput: '../logs/',
    modelsPath: './models/',
    tempPath: './temp/'
  },

  // Error messages
  messages: {
    premiumRequired: {
      ro: 'Această funcționalitate este disponibilă doar pentru utilizatorii Premium.',
      en: 'This feature is only available for Premium users.'
    },
    upgradePrompt: {
      ro: 'Upgrade la Premium pentru funcționalități avansate!',
      en: 'Upgrade to Premium for advanced features!'
    },
    limitReached: {
      ro: 'Ați atins limita de analize pentru astăzi. Upgrade la Premium pentru analize nelimitate.',
      en: 'You have reached your daily analysis limit. Upgrade to Premium for unlimited analyses.'
    }
  }
};

// Helper functions
const premiumUtils = {
  /**
   * Check if user has premium access
   */
  isPremiumUser(user) {
    return user && (user.tier === 'premium' || user.userTier === 'premium');
  },

  /**
   * Get user configuration based on tier
   */
  getUserConfig(user) {
    const tier = this.isPremiumUser(user) ? 'premium' : 'free';
    return {
      processing: premiumConfig.processing[tier],
      models: premiumConfig.models[tier],
      ui: premiumConfig.ui[tier],
      tier: tier
    };
  },

  /**
   * Check if feature is available for user
   */
  hasFeature(user, featureName) {
    if (!this.isPremiumUser(user)) {
      // Free users have limited features
      const freeFeatures = ['basicAnalysis', 'detailedExplanation'];
      return freeFeatures.includes(featureName);
    }
    return premiumConfig.features[featureName] || false;
  },

  /**
   * Get processing limits for user
   */
  getProcessingLimits(user) {
    const config = this.getUserConfig(user);
    return config.processing;
  },

  /**
   * Generate premium features list for user
   */
  getAvailableFeaturesForUser(user) {
    if (!this.isPremiumUser(user)) {
      return Object.keys(premiumConfig.features).filter(feature => 
        !premiumConfig.features[feature]
      );
    }
    
    return Object.keys(premiumConfig.features).filter(feature => 
      premiumConfig.features[feature]
    );
  },

  /**
   * Format response based on user tier
   */
  formatResponse(data, user) {
    const isPremium = this.isPremiumUser(user);
    const config = this.getUserConfig(user);

    const baseResponse = {
      success: data.success,
      isPremium: isPremium,
      userTier: config.tier
    };

    if (isPremium) {
      return {
        ...baseResponse,
        ...data,
        premiumFeatures: this.getAvailableFeaturesForUser(user),
        config: config
      };
    } else {
      return {
        ...baseResponse,
        message: premiumConfig.messages.upgradePrompt.ro,
        availableFeatures: this.getAvailableFeaturesForUser(user),
        upgradeInfo: {
          benefits: Object.keys(premiumConfig.features),
          currentLimits: config.processing
        }
      };
    }
  }
};

module.exports = {
  premiumConfig,
  premiumUtils
};
