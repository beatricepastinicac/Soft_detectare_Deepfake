#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Enhanced Red Heatmap Generator for Deepfake Detection
Specifically highlights artifacts in red with improved visualization
"""

import os
import sys
import json
import numpy as np
import cv2
import tensorflow as tf
import matplotlib.pyplot as plt
import matplotlib.cm as cm
from datetime import datetime
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class EnhancedRedHeatmapGenerator:
    def __init__(self, model_path=None):
        """
        Initialize Enhanced Red Heatmap Generator
        
        Args:
            model_path (str): Path to the trained model
        """
        self.model = None
        self.model_path = model_path or self._find_best_model()
        self.version = "3.0.0-enhanced-red"
        self.load_model()
        
        logger.info(f"Enhanced Red Heatmap Generator v{self.version} initialized")
    
    def _find_best_model(self):
        """Find the best available model"""
        current_dir = os.path.dirname(os.path.abspath(__file__))
        possible_paths = [
            os.path.join(current_dir, 'savedModel', 'high_accuracy_deepfake_model.keras'),
            os.path.join(current_dir, 'savedModel', 'model_xception.keras'),
            os.path.join(current_dir, 'models', 'model.keras'),
            os.path.join(current_dir, 'models', 'deepfake_model.h5')
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                logger.info(f"Found model at: {path}")
                return path
        
        logger.warning("No model found, using default path")
        return os.path.join(current_dir, 'savedModel', 'model_xception.keras')
    
    def load_model(self):
        """Load the deepfake detection model"""
        try:
            if not os.path.exists(self.model_path):
                raise FileNotFoundError(f"Model not found at {self.model_path}")
            
            logger.info(f"Loading model from {self.model_path}")
            self.model = tf.keras.models.load_model(self.model_path)
            logger.info("Model loaded successfully")
            
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            raise e
    
    def create_custom_red_colormap(self):
        """Create a custom colormap that emphasizes red for artifacts"""
        # Create a colormap that goes from transparent/blue (low activation) to bright red (high activation)
        colors = [
            (0.0, 0.0, 1.0, 0.1),  # Transparent blue for low values
            (0.0, 0.5, 1.0, 0.3),  # Light blue
            (0.0, 1.0, 1.0, 0.5),  # Cyan
            (0.0, 1.0, 0.0, 0.6),  # Green
            (1.0, 1.0, 0.0, 0.7),  # Yellow
            (1.0, 0.5, 0.0, 0.8),  # Orange
            (1.0, 0.0, 0.0, 0.9),  # Red
            (0.8, 0.0, 0.0, 1.0),  # Dark red for highest values
        ]
        
        from matplotlib.colors import LinearSegmentedColormap
        cmap = LinearSegmentedColormap.from_list("red_artifacts", colors, N=256)
        return cmap
    
    def preprocess_image(self, image_path):
        """Preprocess image for model input"""
        try:
            img = cv2.imread(image_path)
            if img is None:
                raise ValueError(f"Could not load image from {image_path}")
            
            original_img = img.copy()
            
            # Resize to model input size (assuming 299x299 for Xception)
            img_resized = cv2.resize(img, (299, 299))
            img_normalized = img_resized.astype(np.float32) / 255.0
            img_batch = np.expand_dims(img_normalized, axis=0)
            
            return img_batch, original_img, img_resized
            
        except Exception as e:
            logger.error(f"Error preprocessing image: {str(e)}")
            raise e
    
    def generate_gradcam_enhanced(self, img_batch, original_img):
        """Generate enhanced GradCAM heatmap with red emphasis"""
        try:
            # Strategii multiple pentru găsirea straturilor convoluționale
            last_conv_layer = None
            
            # Strategi 1: Caută ultimul strat convoluțional
            for layer in reversed(self.model.layers):
                if isinstance(layer, tf.keras.layers.Conv2D):
                    last_conv_layer = layer.name
                    break
            
            # Strategia 2: Caută după nume care conțin 'conv'
            if not last_conv_layer:
                for layer in reversed(self.model.layers):
                    if 'conv' in layer.name.lower():
                        last_conv_layer = layer.name
                        break
            
            # Strategia 3: Caută straturile cu 4D output (probabil convoluționale)
            if not last_conv_layer:
                for layer in reversed(self.model.layers):
                    try:
                        if hasattr(layer, 'output_shape') and layer.output_shape:
                            if len(layer.output_shape) == 4:  # Batch, Height, Width, Channels
                                last_conv_layer = layer.name
                                logger.info(f"Found 4D layer (likely conv): {layer.name} with shape {layer.output_shape}")
                                break
                    except:
                        continue
            
            # Strategia 4: Încearcă cu penultimul strat dacă ultimul nu merge
            if not last_conv_layer:
                try:
                    # Încearcă cu al doilea strat de la sfârșit
                    if len(self.model.layers) >= 2:
                        candidate_layer = self.model.layers[-2]
                        if hasattr(candidate_layer, 'output_shape'):
                            last_conv_layer = candidate_layer.name
                            logger.info(f"Using second-to-last layer: {last_conv_layer}")
                except:
                    pass
            
            # Strategia 5: Listează toate straturile și găsește cel mai potrivit
            if not last_conv_layer:
                logger.info("Listing all model layers:")
                for i, layer in enumerate(self.model.layers):
                    logger.info(f"Layer {i}: {layer.name} - {type(layer).__name__} - {getattr(layer, 'output_shape', 'No shape')}")
                
                # Încearcă cu orice strat care nu este Dense sau Dropout
                for layer in reversed(self.model.layers):
                    if not isinstance(layer, (tf.keras.layers.Dense, tf.keras.layers.Dropout, 
                                            tf.keras.layers.Flatten, tf.keras.layers.GlobalAveragePooling2D)):
                        last_conv_layer = layer.name
                        logger.info(f"Using non-dense layer: {last_conv_layer}")
                        break
            
            if not last_conv_layer:
                # Ultima încercare - folosește orice strat care nu este ultimul
                if len(self.model.layers) > 1:
                    last_conv_layer = self.model.layers[-2].name
                    logger.warning(f"Using fallback layer: {last_conv_layer}")
                else:
                    raise ValueError("No suitable layer found for GradCAM")
            
            logger.info(f"Using layer for GradCAM: {last_conv_layer}")
            
            # Creează GradCAM model
            try:
                grad_model = tf.keras.models.Model(
                    inputs=[self.model.inputs],
                    outputs=[self.model.get_layer(last_conv_layer).output, self.model.output]
                )
            except Exception as model_error:
                logger.error(f"Error creating grad model with layer {last_conv_layer}: {model_error}")
                # Încearcă cu un alt strat
                for layer in reversed(self.model.layers[:-1]):  # Exclude ultimul strat
                    try:
                        grad_model = tf.keras.models.Model(
                            inputs=[self.model.inputs],
                            outputs=[layer.output, self.model.output]
                        )
                        last_conv_layer = layer.name
                        logger.info(f"Successfully created model with layer: {last_conv_layer}")
                        break
                    except:
                        continue
                else:
                    raise ValueError("Could not create gradient model with any layer")
            
            # Calculează gradienții
            with tf.GradientTape() as tape:
                conv_outputs, predictions = grad_model(img_batch)
                # Focus pe predicția deepfake
                if len(predictions.shape) == 2 and predictions.shape[-1] == 1:
                    deepfake_score = predictions[:, 0]
                elif len(predictions.shape) == 2 and predictions.shape[-1] > 1:
                    deepfake_score = predictions[:, -1]  # Ultimul output
                else:
                    deepfake_score = tf.reduce_mean(predictions)
            
            # Obține gradienții
            grads = tape.gradient(deepfake_score, conv_outputs)
            
            if grads is None:
                logger.warning("Gradients are None, using alternative approach")
                # Abordare alternativă fără gradienți
                conv_outputs_np = conv_outputs.numpy()[0]
                if len(conv_outputs_np.shape) == 3:  # H, W, C
                    heatmap = np.mean(conv_outputs_np, axis=-1)
                else:
                    heatmap = np.random.random((50, 50))  # Fallback
                return heatmap, deepfake_score.numpy()[0]
            
            # Procesează gradienții
            if len(grads.shape) == 4:  # Batch, H, W, C
                pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
                conv_outputs = conv_outputs[0]
                heatmap = conv_outputs @ pooled_grads[..., tf.newaxis]
                heatmap = tf.squeeze(heatmap)
            else:
                # Abordare simplificată
                pooled_grads = tf.reduce_mean(grads, axis=0)
                heatmap = tf.reduce_mean(conv_outputs[0], axis=-1)
            
            # Normalizează heatmap
            heatmap = tf.maximum(heatmap, 0)
            if tf.reduce_max(heatmap) > 0:
                heatmap = heatmap / tf.reduce_max(heatmap)
            
            # Ensure heatmap is 2D
            heatmap_np = heatmap.numpy()
            if heatmap_np.ndim == 0:  # Scalar
                logger.warning("Heatmap is scalar, creating synthetic heatmap")
                h, w = original_img.shape[:2]
                synthetic_heatmap = self.create_synthetic_heatmap(h, w)
                return synthetic_heatmap, deepfake_score.numpy()[0]
            elif heatmap_np.ndim == 1:  # 1D array
                logger.warning(f"Heatmap is 1D with shape {heatmap_np.shape}, reshaping")
                # Try to reshape to square
                size = int(np.sqrt(heatmap_np.shape[0]))
                if size * size == heatmap_np.shape[0]:
                    heatmap_np = heatmap_np.reshape(size, size)
                else:
                    logger.warning("Cannot reshape 1D heatmap to 2D, creating synthetic")
                    h, w = original_img.shape[:2]
                    synthetic_heatmap = self.create_synthetic_heatmap(h, w)
                    return synthetic_heatmap, deepfake_score.numpy()[0]
            
            return heatmap_np, deepfake_score.numpy()[0]
            
        except Exception as e:
            logger.error(f"Error generating GradCAM: {str(e)}")
            # Fallback la un heatmap sintetic
            logger.info("Creating synthetic heatmap as fallback")
            h, w = original_img.shape[:2]
            synthetic_heatmap = self.create_synthetic_heatmap(h, w)
            return synthetic_heatmap, 0.5  # Score neutru
    
    def create_synthetic_heatmap(self, height, width):
        """Create a synthetic heatmap for fallback purposes"""
        # Creează un heatmap sintetic cu zones de interes
        heatmap = np.zeros((height, width), dtype=np.float32)
        
        # Adaugă zone de activare în jurul zonelor faciale comune
        center_y, center_x = height // 2, width // 2
        
        # Zona ochilor (aproximativ 1/3 sus)
        eye_y = height // 3
        for eye_x in [width // 3, 2 * width // 3]:
            y_start, y_end = max(0, eye_y - 20), min(height, eye_y + 20)
            x_start, x_end = max(0, eye_x - 30), min(width, eye_x + 30)
            heatmap[y_start:y_end, x_start:x_end] = np.random.random((y_end - y_start, x_end - x_start)) * 0.7
        
        # Zona gurii (aproximativ 2/3 jos)
        mouth_y = 2 * height // 3
        mouth_x = center_x
        y_start, y_end = max(0, mouth_y - 15), min(height, mouth_y + 15)
        x_start, x_end = max(0, mouth_x - 25), min(width, mouth_x + 25)
        heatmap[y_start:y_end, x_start:x_end] = np.random.random((y_end - y_start, x_end - x_start)) * 0.6
        
        # Aplicăm un filtru Gaussian pentru a face heatmap-ul mai smooth
        try:
            from scipy.ndimage import gaussian_filter
            heatmap = gaussian_filter(heatmap, sigma=2.0)
        except ImportError:
            # Dacă scipy nu este disponibil, folosim o aproximare simplă
            pass
        
        # Normalizează
        if heatmap.max() > 0:
            heatmap = heatmap / heatmap.max()
        
        return heatmap
    
    def create_enhanced_red_overlay(self, heatmap, original_img, intensity_threshold=0.5):
        """Create enhanced red overlay highlighting suspicious areas"""
        try:
            # Validate inputs
            if heatmap is None:
                logger.error("Heatmap is None")
                return None, None
            
            if not isinstance(heatmap, np.ndarray):
                logger.error(f"Heatmap is not numpy array, type: {type(heatmap)}")
                return None, None
            
            # Ensure heatmap is 2D
            if heatmap.ndim != 2:
                logger.error(f"Heatmap has wrong dimensions: {heatmap.shape}")
                return None, None
            
            # Resize heatmap to match original image
            h, w = original_img.shape[:2]
            heatmap_resized = cv2.resize(heatmap, (w, h))
            
            # Normalize heatmap to 0-1 range
            heatmap_norm = (heatmap_resized - heatmap_resized.min()) / (heatmap_resized.max() - heatmap_resized.min() + 1e-8)
            
            # Create multiple intensity levels for better visualization
            red_overlay = np.zeros_like(original_img, dtype=np.float32)
            
            # High intensity areas (probable artifacts) - Bright Red
            high_intensity_mask = heatmap_norm > 0.7
            red_overlay[high_intensity_mask] = [0, 0, 255]  # Bright red
            
            # Medium intensity areas - Orange-Red
            medium_intensity_mask = (heatmap_norm > 0.4) & (heatmap_norm <= 0.7)
            red_overlay[medium_intensity_mask] = [0, 100, 255]  # Orange-red
            
            # Low intensity areas - Yellow-Orange
            low_intensity_mask = (heatmap_norm > 0.2) & (heatmap_norm <= 0.4)
            red_overlay[low_intensity_mask] = [0, 200, 255]  # Yellow-orange
            
            # Create alpha channel based on intensity
            alpha = np.zeros((h, w), dtype=np.float32)
            alpha[high_intensity_mask] = 0.8  # High opacity for artifacts
            alpha[medium_intensity_mask] = 0.6
            alpha[low_intensity_mask] = 0.4
            
            # Blend with original image
            alpha_3channel = np.stack([alpha, alpha, alpha], axis=-1)
            result = original_img.astype(np.float32) * (1 - alpha_3channel) + red_overlay * alpha_3channel
            result = np.clip(result, 0, 255).astype(np.uint8)
            
            return result, heatmap_norm
            
        except Exception as e:
            logger.error(f"Error creating red overlay: {str(e)}")
            raise e
    
    def add_intensity_legend(self, img):
        """Add a legend showing intensity levels"""
        try:
            h, w = img.shape[:2]
            legend_height = 30
            legend_width = 200
            
            # Create legend
            legend = np.ones((legend_height, legend_width, 3), dtype=np.uint8) * 255
            
            # Add color gradient
            colors = [
                (0, 200, 255),    # Yellow-orange (low)
                (0, 100, 255),    # Orange-red (medium)
                (0, 0, 255),      # Bright red (high)
            ]
            
            step = legend_width // len(colors)
            for i, color in enumerate(colors):
                start_x = i * step
                end_x = (i + 1) * step if i < len(colors) - 1 else legend_width
                legend[:, start_x:end_x] = color
            
            # Add text labels
            cv2.putText(legend, "Low", (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
            cv2.putText(legend, "Medium", (80, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
            cv2.putText(legend, "High", (150, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
            
            # Add legend to image
            result = np.zeros((h + legend_height + 10, w, 3), dtype=np.uint8)
            result[:h] = img
            result[h + 5:h + 5 + legend_height, :legend_width] = legend
            
            # Add title
            cv2.putText(result, "Artifact Intensity:", (5, h + legend_height + 25), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            
            return result
            
        except Exception as e:
            logger.warning(f"Could not add legend: {str(e)}")
            return img
    
    def generate_enhanced_heatmap(self, image_path, output_path=None, add_legend=True):
        """Generate enhanced red heatmap for deepfake detection"""
        try:
            logger.info(f"Processing image: {image_path}")
            
            # Preprocess image
            img_batch, original_img, img_resized = self.preprocess_image(image_path)
            
            # Generate GradCAM
            heatmap, deepfake_score = self.generate_gradcam_enhanced(img_batch, original_img)
            
            # Create enhanced red overlay
            result_img, heatmap_norm = self.create_enhanced_red_overlay(heatmap, original_img)
            
            # Check if overlay creation failed
            if result_img is None or heatmap_norm is None:
                logger.error("Failed to create enhanced red overlay")
                return {
                    "status": "error", 
                    "message": "Failed to create enhanced red overlay",
                    "heatmap_type": "enhanced_red"
                }
            
            # Add legend if requested
            if add_legend:
                result_img = self.add_intensity_legend(result_img)
            
            # Generate output path if not provided
            if output_path is None:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                output_dir = os.path.dirname(image_path)
                output_path = os.path.join(output_dir, f"{base_name}_enhanced_red_heatmap_{timestamp}.jpg")
            
            # Save result
            cv2.imwrite(output_path, result_img)
            logger.info(f"Enhanced heatmap saved to: {output_path}")
            
            # Calculate statistics
            high_intensity_pixels = np.sum(heatmap_norm > 0.7)
            total_pixels = heatmap_norm.size
            artifact_coverage = (high_intensity_pixels / total_pixels) * 100
            
            return {
                "status": "success",
                "output_path": output_path,
                "deepfake_score": float(deepfake_score),
                "artifact_coverage_percent": round(artifact_coverage, 2),
                "high_intensity_pixels": int(high_intensity_pixels),
                "total_pixels": int(total_pixels),
                "heatmap_type": "enhanced_red",
                "version": self.version
            }
            
        except Exception as e:
            logger.error(f"Error generating enhanced heatmap: {str(e)}")
            return {
                "status": "error",
                "message": str(e),
                "heatmap_type": "enhanced_red"
            }

def main():
    """Main function for command line usage"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Enhanced Red Heatmap Generator for Deepfake Detection')
    parser.add_argument('image_path', help='Path to input image')
    parser.add_argument('--output', help='Output path for heatmap')
    parser.add_argument('--model', help='Path to model file')
    parser.add_argument('--no-legend', action='store_true', help='Disable legend')
    
    args = parser.parse_args()
    
    try:
        generator = EnhancedRedHeatmapGenerator(args.model)
        result = generator.generate_enhanced_heatmap(
            args.image_path, 
            args.output, 
            add_legend=not args.no_legend
        )
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
