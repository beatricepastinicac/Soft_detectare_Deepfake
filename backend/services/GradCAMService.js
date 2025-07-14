const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

class GradCAMService {
  constructor() {
    this.model = null;
    this.lastConvLayer = null;
  }

  /**
   * Încarcă modelul TensorFlow pentru Grad-CAM
   */
  async loadModel(modelPath) {
    try {
      console.log('Loading model for Grad-CAM:', modelPath);
      this.model = await tf.loadLayersModel(`file://${modelPath}`);
      
      // Găsește ultimul layer convolutional pentru Grad-CAM
      this.lastConvLayer = this.findLastConvLayer();
      console.log('Last conv layer found:', this.lastConvLayer?.name);
      
      return true;
    } catch (error) {
      console.error('Error loading model for Grad-CAM:', error);
      return false;
    }
  }

  /**
   * Găsește ultimul layer convolutional din model
   */
  findLastConvLayer() {
    const layers = this.model.layers;
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer.getClassName() === 'Conv2D') {
        return layer;
      }
    }
    return null;
  }

  /**
   * Preprocesează imaginea pentru model
   */
  async preprocessImage(imagePath, targetSize = [224, 224]) {
    try {
      // Citește și redimensionează imaginea
      const imageBuffer = await sharp(imagePath)
        .resize(targetSize[0], targetSize[1])
        .removeAlpha()
        .raw()
        .toBuffer();

      // Convertește la tensor
      const tensor = tf.tensor3d(
        new Uint8Array(imageBuffer),
        [targetSize[0], targetSize[1], 3],
        'int32'
      );

      // Normalizează valorile pixelilor la [0, 1]
      const normalized = tensor.cast('float32').div(255.0);
      
      // Adaugă dimensiunea batch
      const batched = normalized.expandDims(0);
      
      tensor.dispose();
      normalized.dispose();
      
      return batched;
    } catch (error) {
      console.error('Error preprocessing image:', error);
      throw error;
    }
  }

  /**
   * Generează Grad-CAM heatmap
   */
  async generateGradCAM(imagePath, classIndex = 0) {
    try {
      if (!this.model || !this.lastConvLayer) {
        throw new Error('Model not loaded or last conv layer not found');
      }

      // Preprocesează imaginea
      const inputTensor = await this.preprocessImage(imagePath);
      
      // Creează un sub-model până la ultimul layer convolutional
      const convModel = tf.model({
        inputs: this.model.input,
        outputs: this.lastConvLayer.output
      });

      // Creează un model pentru predicție finală
      const classifierModel = tf.model({
        inputs: this.lastConvLayer.output,
        outputs: this.model.output
      });

      // Calculează gradienții folosind GradientTape
      const gradCAMResult = tf.tidy(() => {
        return tf.variableGrads(() => {
          // Forward pass prin conv layers
          const convOutput = convModel.predict(inputTensor);
          
          // Forward pass prin classifier
          const predictions = classifierModel.predict(convOutput);
          
          // Extrage scorul pentru clasa specificată
          const classScore = predictions.gather([classIndex], 1);
          
          return classScore;
        }, [inputTensor]);
      });

      // Calculează gradienții pentru ultimul layer conv
      const grads = gradCAMResult.grads[inputTensor];
      const convOutput = convModel.predict(inputTensor);

      // Calculează importanța fiecărui canal
      const channelWeights = tf.mean(grads, [0, 1, 2]);

      // Calculează heatmap-ul prin înmulțirea cu importanța
      const heatmap = tf.sum(
        tf.mul(convOutput.squeeze([0]), channelWeights),
        [2]
      );

      // Aplică ReLU pentru a păstra doar valorile pozitive
      const reluHeatmap = tf.relu(heatmap);

      // Normalizează heatmap-ul
      const normalizedHeatmap = this.normalizeHeatmap(reluHeatmap);

      // Cleanup
      inputTensor.dispose();
      convOutput.dispose();
      grads.dispose();
      heatmap.dispose();
      reluHeatmap.dispose();
      convModel.dispose();
      classifierModel.dispose();

      return normalizedHeatmap;
    } catch (error) {
      console.error('Error generating Grad-CAM:', error);
      throw error;
    }
  }

  /**
   * Normalizează heatmap-ul la [0, 1]
   */
  normalizeHeatmap(heatmap) {
    const min = tf.min(heatmap);
    const max = tf.max(heatmap);
    const range = tf.sub(max, min);
    
    const normalized = tf.div(tf.sub(heatmap, min), range);
    
    min.dispose();
    max.dispose();
    range.dispose();
    
    return normalized;
  }

  /**
   * Convertește tensor-ul heatmap la imagine
   */
  async tensorToImage(heatmapTensor, originalImagePath, outputPath) {
    try {
      // Obține dimensiunile imaginii originale
      const { width, height } = await sharp(originalImagePath).metadata();
      
      // Convertește tensor-ul la array
      const heatmapData = await heatmapTensor.data();
      const [heatmapHeight, heatmapWidth] = heatmapTensor.shape;

      // Creează o imagine colorată din heatmap
      const coloredHeatmap = this.applyColorMap(heatmapData, heatmapWidth, heatmapHeight);

      // Redimensionează heatmap-ul la dimensiunea imaginii originale
      const resizedHeatmap = await sharp(coloredHeatmap, {
        raw: {
          width: heatmapWidth,
          height: heatmapHeight,
          channels: 3
        }
      })
      .resize(width, height)
      .png()
      .toBuffer();

      // Încarcă imaginea originală
      const originalImage = await sharp(originalImagePath).toBuffer();

      // Combină imaginea originală cu heatmap-ul
      const result = await sharp(originalImage)
        .composite([{
          input: resizedHeatmap,
          blend: 'multiply',
          opacity: 0.6
        }])
        .jpeg({ quality: 90 })
        .toFile(outputPath);

      heatmapTensor.dispose();
      
      return {
        success: true,
        outputPath,
        size: result.size
      };
    } catch (error) {
      console.error('Error converting tensor to image:', error);
      throw error;
    }
  }

  /**
   * Aplică color map pe heatmap (jet colormap)
   */
  applyColorMap(heatmapData, width, height) {
    const rgbData = new Uint8Array(width * height * 3);
    
    for (let i = 0; i < heatmapData.length; i++) {
      const value = heatmapData[i];
      const rgb = this.jetColorMap(value);
      
      rgbData[i * 3] = rgb.r;
      rgbData[i * 3 + 1] = rgb.g;
      rgbData[i * 3 + 2] = rgb.b;
    }
    
    return rgbData;
  }

  /**
   * Jet color map implementation
   */
  jetColorMap(value) {
    const clampedValue = Math.max(0, Math.min(1, value));
    
    let r, g, b;
    
    if (clampedValue < 0.25) {
      r = 0;
      g = 4 * clampedValue;
      b = 1;
    } else if (clampedValue < 0.5) {
      r = 0;
      g = 1;
      b = 1 - 4 * (clampedValue - 0.25);
    } else if (clampedValue < 0.75) {
      r = 4 * (clampedValue - 0.5);
      g = 1;
      b = 0;
    } else {
      r = 1;
      g = 1 - 4 * (clampedValue - 0.75);
      b = 0;
    }
    
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  /**
   * Generează heatmap complet - funcția principală
   */
  async generateHeatmapFromModel(imagePath, modelPath, outputDir, options = {}) {
    try {
      const {
        classIndex = 0,
        opacity = 0.6,
        colorIntensity = 1.0
      } = options;

      console.log('Starting Grad-CAM generation...');
      
      // Încarcă modelul
      const modelLoaded = await this.loadModel(modelPath);
      if (!modelLoaded) {
        throw new Error('Failed to load model');
      }

      // Generează Grad-CAM
      const heatmapTensor = await this.generateGradCAM(imagePath, classIndex);
      
      // Creează calea de output
      const timestamp = Date.now();
      const outputPath = path.join(outputDir, `gradcam_heatmap_${timestamp}.jpg`);
      
      // Convertește la imagine și salvează
      const result = await this.tensorToImage(heatmapTensor, imagePath, outputPath);
      
      console.log('Grad-CAM heatmap generated successfully:', outputPath);
      
      return {
        success: true,
        heatmapPath: outputPath,
        originalPath: imagePath,
        size: result.size,
        method: 'grad-cam'
      };
      
    } catch (error) {
      console.error('Error in Grad-CAM generation:', error);
      return {
        success: false,
        error: error.message,
        method: 'grad-cam'
      };
    }
  }
}

module.exports = new GradCAMService();
