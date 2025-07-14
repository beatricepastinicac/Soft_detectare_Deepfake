import os
import sys
import argparse
import json
import cv2
import numpy as np
import tensorflow as tf
import time
from scipy import ndimage

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

try:
    from advancedDeepfakeDetector import AdvancedDeepfakeDetector
except ImportError:
    try:
        from customModel import DeepfakeDetector as AdvancedDeepfakeDetector
    except ImportError:
        print(json.dumps({
            "status": "failed",
            "message": "Could not import AdvancedDeepfakeDetector class"
        }))
        sys.exit(1)

def apply_guided_backprop(model, image, layer_name):
    """Apply Guided Backpropagation for better heatmap clarity"""
    @tf.custom_gradient
    def guided_relu(x):
        def grad(dy):
            return tf.cast(dy > 0, tf.float32) * tf.cast(x > 0, tf.float32) * dy
        return tf.nn.relu(x), grad
    
    guided_model = tf.keras.models.clone_model(model)
    guided_model.build(model.input_shape)
    guided_model.set_weights(model.get_weights())
    
    for layer in guided_model.layers:
        if hasattr(layer, 'activation') and layer.activation == tf.nn.relu:
            layer.activation = guided_relu
    
    return guided_model

def generate_gradcam_plus_plus(model, image, target_layer_name):
    """Generate GradCAM++ heatmap with improved localization"""
    grad_model = tf.keras.models.Model(
        inputs=[model.inputs],
        outputs=[model.get_layer(target_layer_name).output, model.output]
    )
    
    with tf.GradientTape() as tape:
        conv_outputs, predictions = grad_model(image)
        loss = predictions[:, 0]
    
    grads = tape.gradient(loss, conv_outputs)
    
    grads_2 = grads ** 2
    grads_3 = grads_2 * grads
    
    alpha = tf.reduce_sum(grads_2, axis=(1, 2), keepdims=True) / (
        2 * grads_2 + tf.reduce_sum(grads_3, axis=(1, 2), keepdims=True) + 1e-7
    )
    
    weights = tf.reduce_sum(alpha * tf.nn.relu(grads), axis=(1, 2))
    
    conv_outputs = conv_outputs[0]
    heatmap = tf.reduce_sum(weights[:, np.newaxis, np.newaxis, :] * conv_outputs, axis=-1)
    
    heatmap = tf.maximum(heatmap, 0)
    heatmap = heatmap / (tf.reduce_max(heatmap) + 1e-7)
    
    return heatmap.numpy()

def generate_layercam(model, image, target_layer_name):
    """Generate LayerCAM for more accurate localization"""
    grad_model = tf.keras.models.Model(
        inputs=[model.inputs],
        outputs=[model.get_layer(target_layer_name).output, model.output]
    )
    
    with tf.GradientTape() as tape:
        conv_outputs, predictions = grad_model(image)
        loss = predictions[:, 0]
    
    grads = tape.gradient(loss, conv_outputs)
    
    guided_grads = tf.cast(conv_outputs > 0, tf.float32) * tf.cast(grads > 0, tf.float32) * grads
    
    heatmap = tf.reduce_sum(guided_grads * conv_outputs, axis=-1)
    heatmap = tf.maximum(heatmap, 0)
    heatmap = heatmap / (tf.reduce_max(heatmap) + 1e-7)
    
    return heatmap.numpy()[0]

def apply_morphological_operations(heatmap):
    """Apply morphological operations to clean up the heatmap"""
    heatmap_uint8 = (heatmap * 255).astype(np.uint8)
    
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    opened = cv2.morphologyEx(heatmap_uint8, cv2.MORPH_OPEN, kernel)
    
    blurred = cv2.GaussianBlur(opened, (7, 7), 0)
    
    return blurred.astype(np.float32) / 255.0

def enhance_heatmap_contrast(heatmap):
    """Enhance heatmap contrast using CLAHE"""
    heatmap_uint8 = (heatmap * 255).astype(np.uint8)
    
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(heatmap_uint8)
    
    return enhanced.astype(np.float32) / 255.0

def create_advanced_overlay(original_img, heatmap, colormap=cv2.COLORMAP_VIRIDIS):
    """Create an advanced overlay with multiple visualization options"""
    heatmap = apply_morphological_operations(heatmap)
    heatmap = enhance_heatmap_contrast(heatmap)
    
    heatmap_resized = cv2.resize(heatmap, (original_img.shape[1], original_img.shape[0]))
    
    heatmap_colored = cv2.applyColorMap((heatmap_resized * 255).astype(np.uint8), colormap)
    
    overlays = {}
    
    overlays['standard'] = cv2.addWeighted(original_img, 0.6, heatmap_colored, 0.4, 0)
    
    overlays['high_contrast'] = cv2.addWeighted(original_img, 0.4, heatmap_colored, 0.6, 0)
    
    mask = (heatmap_resized > 0.5).astype(np.float32)
    mask_3d = np.repeat(mask[:, :, np.newaxis], 3, axis=2)
    overlays['masked'] = (original_img * (1 - mask_3d) + heatmap_colored * mask_3d).astype(np.uint8)
    
    contours, _ = cv2.findContours((heatmap_resized * 255).astype(np.uint8), 
                                  cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour_img = original_img.copy()
    cv2.drawContours(contour_img, contours, -1, (0, 255, 255), 2)
    overlays['contour'] = contour_img
    
    return overlays

def find_best_conv_layer(model):
    """Find the best convolutional layer for heatmap generation"""
    conv_layers = []
    for i, layer in enumerate(model.layers):
        if isinstance(layer, tf.keras.layers.Conv2D):
            conv_layers.append((i, layer.name, layer.output_shape))
    
    if not conv_layers:
        return None
    
    return conv_layers[-1][1]

def generate_advanced_heatmap(image_path, model_path, fake_score=None, method='gradcam++'):
    """
    Generate advanced heatmap with multiple visualization techniques
    
    Args:
        image_path: Path to the input image
        model_path: Path to the trained model
        fake_score: Optional pre-calculated fake score
        method: Heatmap generation method ('gradcam++', 'layercam', 'both')
        
    Returns:
        Dictionary with status and paths to saved heatmaps
    """
    try:
        if not os.path.exists(image_path):
            return {
                "status": "failed",
                "message": f"Image file not found: {image_path}"
            }
            
        if not os.path.exists(model_path):
            return {
                "status": "failed",
                "message": f"Model file not found: {model_path}"
            }
        
        detector = AdvancedDeepfakeDetector(modelPath=model_path)
        
        if fake_score is None:
            prediction_result = detector.predict(image_path)
            if "error" in prediction_result:
                return {
                    "status": "failed",
                    "message": prediction_result["error"]
                }
            fake_score = prediction_result.get("fakeScore", 0)
        
        if fake_score <= 30:
            return {
                "status": "skipped",
                "message": f"Fake score ({fake_score}) is too low for heatmap generation"
            }
        
        img = cv2.imread(image_path)
        original_img = img.copy()
        
        input_shape = detector.inputShape
        img_resized = cv2.resize(img, (input_shape[0], input_shape[1]))
        img_normalized = img_resized.astype('float32') / 255.0
        img_tensor = np.expand_dims(img_normalized, axis=0)
        
        target_layer = find_best_conv_layer(detector.model)
        if not target_layer:
            return {
                "status": "failed",
                "message": "Could not find suitable convolutional layer"
            }
        
        heatmaps = {}
        generated_files = []
        
        if method in ['gradcam++', 'both']:
            heatmap_gradcam = generate_gradcam_plus_plus(detector.model, img_tensor, target_layer)
            heatmaps['gradcam++'] = heatmap_gradcam
        
        if method in ['layercam', 'both']:
            heatmap_layercam = generate_layercam(detector.model, img_tensor, target_layer)
            heatmaps['layercam'] = heatmap_layercam
        
        timestamp = int(time.time())
        output_dir = os.path.dirname(image_path)
        base_filename = os.path.basename(image_path).split('.')[0]
        
        for heatmap_name, heatmap in heatmaps.items():
            overlays = create_advanced_overlay(original_img, heatmap)
            
            for overlay_name, overlay_img in overlays.items():
                filename = f"heatmap_advanced_{heatmap_name}_{overlay_name}_{base_filename}_{timestamp}.jpg"
                output_path = os.path.join(output_dir, filename)
                cv2.imwrite(output_path, overlay_img)
                generated_files.append(output_path)
        
        if method == 'both' and len(heatmaps) == 2:
            gradcam_overlay = create_advanced_overlay(original_img, heatmaps['gradcam++'])['standard']
            layercam_overlay = create_advanced_overlay(original_img, heatmaps['layercam'])['standard']
            
            height = max(gradcam_overlay.shape[0], layercam_overlay.shape[0])
            gradcam_resized = cv2.resize(gradcam_overlay, (int(gradcam_overlay.shape[1] * height / gradcam_overlay.shape[0]), height))
            layercam_resized = cv2.resize(layercam_overlay, (int(layercam_overlay.shape[1] * height / layercam_overlay.shape[0]), height))
            
            comparison = np.hstack([gradcam_resized, layercam_resized])
            
            cv2.putText(comparison, 'GradCAM++', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            cv2.putText(comparison, 'LayerCAM', (gradcam_resized.shape[1] + 10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            
            comparison_filename = f"heatmap_comparison_{base_filename}_{timestamp}.jpg"
            comparison_path = os.path.join(output_dir, comparison_filename)
            cv2.imwrite(comparison_path, comparison)
            generated_files.append(comparison_path)
        
        primary_method = 'gradcam++' if 'gradcam++' in heatmaps else 'layercam'
        primary_filename = f"heatmap_advanced_{primary_method}_standard_{base_filename}_{timestamp}.jpg"
        primary_path = os.path.join(output_dir, primary_filename)
        
        return {
            "status": "success",
            "path": primary_path,
            "all_files": generated_files,
            "fake_score": round(float(fake_score), 2),
            "heatmap_type": "advanced",
            "methods_used": list(heatmaps.keys()),
            "overlay_types": list(create_advanced_overlay(original_img, list(heatmaps.values())[0]).keys())
        }
        
    except Exception as e:
        return {
            "status": "failed",
            "message": f"Error generating advanced heatmap: {str(e)}"
        }

def main():
    parser = argparse.ArgumentParser(description='Generate advanced heatmaps for deepfake detection')
    parser.add_argument('image_path', help='Path to the input image')
    parser.add_argument('model_path', help='Path to the trained model')
    parser.add_argument('fake_score', nargs='?', type=float, default=None, 
                      help='Optional fake score (0-100)')
    parser.add_argument('--method', choices=['gradcam++', 'layercam', 'both'], 
                      default='gradcam++', help='Heatmap generation method')
    
    args = parser.parse_args()
    
    result = generate_advanced_heatmap(args.image_path, args.model_path, args.fake_score, args.method)
    print(json.dumps(result))

if __name__ == "__main__":
    main()