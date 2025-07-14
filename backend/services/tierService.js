const { tierConfigurations } = require('../config/tiers');
const db = require('../db');

class TierService {
  static getUserTier(user) {
    return user && user.userId ? 'premium' : 'free';
  }

  static getTierConfig(tier) {
    return tierConfigurations[tier] || tierConfigurations.free;
  }

  static async checkDailyQuota(user, clientIp) {
    const tier = this.getUserTier(user);
    const config = this.getTierConfig(tier);

    if (config.maxAnalysesPerDay === -1) {
      return { allowed: true, currentCount: 0, maxAllowed: -1, remaining: -1 };
    }

    const today = new Date().toISOString().split('T')[0];
    let currentCount = 0;

    try {
      if (user && user.userId) {
        const [rows] = await db.execute(
          'SELECT COUNT(*) AS count FROM reports WHERE user_id = ? AND DATE(uploaded_at) = ?',
          [user.userId, today]
        );
        currentCount = rows[0].count;
      } else {
        const [rows] = await db.execute(
          'SELECT analyses_count FROM user_quotas WHERE ip_address = ? AND date = ?',
          [clientIp, today]
        );
        currentCount = rows.length > 0 ? rows[0].analyses_count : 0;
      }
    } catch (error) {
      console.error('Error checking quota:', error);
      return { allowed: true, currentCount: 0, maxAllowed: config.maxAnalysesPerDay, remaining: config.maxAnalysesPerDay };
    }

    const allowed = currentCount < config.maxAnalysesPerDay;
    const remaining = config.maxAnalysesPerDay - currentCount;

    return { allowed, currentCount, maxAllowed: config.maxAnalysesPerDay, remaining };
  }

  static async incrementQuota(user, clientIp) {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      if (!user || !user.userId) {
        await db.execute(
          `INSERT INTO user_quotas (ip_address, date, analyses_count) 
           VALUES (?, ?, 1) 
           ON DUPLICATE KEY UPDATE analyses_count = analyses_count + 1`,
          [clientIp, today]
        );
      }
    } catch (error) {
      console.error('Error incrementing quota:', error);
    }
  }

  static validateFileUpload(file, tier) {
    const config = this.getTierConfig(tier);
    const errors = [];

    if (file.size > config.maxFileSize) {
      errors.push({
        type: 'file_size',
        message: `Fișierul este prea mare. Maxim pentru ${config.name}: ${this.formatFileSize(config.maxFileSize)}`,
        limit: config.maxFileSize,
        current: file.size
      });
    }

    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!config.supportedFormats.includes(fileExt)) {
      errors.push({
        type: 'file_format',
        message: `Format ${fileExt} nu e suportat. Acceptate: ${config.supportedFormats.join(', ')}`,
        supportedFormats: config.supportedFormats,
        currentFormat: fileExt
      });
    }

    return { valid: errors.length === 0, errors };
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  static getUpgradeIncentive(currentTier, feature) {
    if (currentTier === 'premium') return null;
    const incentives = {
      file_size: 'Upgrade la Premium pentru fișiere mai mari',
      video_processing: 'Analiză video cu Premium',
      heatmap: 'Heatmap detaliat cu Premium',
      unlimited: 'Analize nelimitate cu Premium',
      history: 'Istoric și export cu Premium'
    };
    return incentives[feature] || 'Upgrade pentru funcții avansate';
  }
}

module.exports = TierService;