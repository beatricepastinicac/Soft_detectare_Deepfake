const TierService = require('../services/tierService');

const tierMiddleware = async (req, res, next) => {
  try {
    req.userTier = TierService.getUserTier(req.user);
    req.tierConfig = TierService.getTierConfig(req.userTier);
    
    req.hasFeature = (feature) => {
      return req.tierConfig.features[feature] === true;
    };
    
    req.checkQuota = async () => {
      return await TierService.checkDailyQuota(req.user, req.ip);
    };
    
    req.validateFile = (file) => {
      return TierService.validateFileUpload(file, req.userTier);
    };
    
    req.getUpgradeMessage = (feature) => {
      return TierService.getUpgradeIncentive(req.userTier, feature);
    };
    
    next();
  } catch (error) {
    console.error('Error in tierMiddleware:', error);
    next(error);
  }
};

module.exports = tierMiddleware;