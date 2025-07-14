const tierConfigurations = {
  free: {
    name: 'Gratuit',
    maxAnalysesPerDay: 5,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    supportedFormats: ['jpg', 'jpeg', 'png'],
    modelType: 'basic',
    resultsDetail: 'basic',
    features: {
      basicAnalysis: true,
      detailedExplanation: true,
      heatmapGeneration: true, // Temporar activat pentru testare
      videoProcessing: false,
      faceAnalysis: true,
      historySaving: true, 
      pdfReports: false,
      apiAccess: false,
      priorityProcessing: false
    }
  },
  premium: {
    name: 'Premium',
    maxAnalysesPerDay: -1, // unlimited
    maxFileSize: 100 * 1024 * 1024, // 100MB
    supportedFormats: ['jpg', 'jpeg', 'png', 'mp4', 'avi', 'mov', 'mkv'],
    modelType: 'advanced',
    resultsDetail: 'comprehensive',
    features: {
      basicAnalysis: true,
      detailedExplanation: true,
      heatmapGeneration: true,
      videoProcessing: true,
      faceAnalysis: true,
      historySaving: true,
      pdfReports: true,
      apiAccess: true,
      priorityProcessing: true
    }
  }
};

module.exports = { tierConfigurations };