import os
import sys
import argparse
import json
import cv2
import numpy as np
import tensorflow as tf
import time

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

try:
    from customModel import DeepfakeDetector
except ImportError:
    try:
        from advancedDeepfakeDetector import AdvancedDeepfakeDetector
    except ImportError:
        print(json.dumps({
            "status": "failed",
            "message": "Could not import any DeepfakeDetector class"
        }))
        sys.exit(1)

try:
    from advancedDeepfakeDetector import AdvancedDeepfakeDetector
    ADVANCED_AVAILABLE = True
except ImportError:
    ADVANCED_AVAILABLE = False

def generate_basic_heatmap(detector, image_path, fake_score):
    """Generate basic heatmap using GradCAM"""
    try:
        img = cv2.imread(image_path)
        orig_img = img.copy()
        
        input_shape = (224, 224, 3)
        img = cv2.resize(img, (input_shape[0], input_shape[1]))
        img = img / 255.0
        img_tensor = np.expand_dims(img, axis=0)
        
        last_conv_layer = None
        for layer in reversed(detector.model.layers):
            if isinstance(layer, tf.keras.layers.Conv2D):
                last_conv_layer = layer.name
                break
        
        if not last_conv_layer:
            return {
                "status": "failed",
                "message": "Could not find convolutional layer for heatmap"
            }
        
        grad_model = tf.keras.models.Model(
            inputs=[detector.model.inputs],
            outputs=[
                detector.model.get_layer(last_conv_layer).output,
                detector.model.output
            ]
        )
        
        with tf.GradientTape() as tape:
            conv_outputs, predictions = grad_model(img_tensor)
            loss = predictions[:, 0]
        
        output = conv_outputs[0]
        grads = tape.gradient(loss, conv_outputs)[0]
        
        gate_f = tf.cast(output > 0, 'float32')
        gate_r = tf.cast(grads > 0, 'float32')
        guided_grads = gate_f * gate_r * grads
        
        weights = tf.reduce_mean(guided_grads, axis=(0, 1))
        
        cam = tf.reduce_sum(tf.multiply(weights, output), axis=-1)
        
        cam = cam.numpy()
        cam = cv2.resize(cam, (orig_img.shape[1], orig_img.shape[0]))
        cam = np.maximum(cam, 0)
        heatmap = (cam - cam.min()) / (cam.max() - cam.min() + 1e-7)
        
        heatmap = np.uint8(255 * heatmap)
        heatmap = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
        
        superimposed_img = heatmap * 0.4 + orig_img
        superimposed_img = np.clip(superimposed_img, 0, 255).astype('uint8')
        
        timestamp = int(time.time())
        output_dir = os.path.dirname(image_path)
        output_filename = f"heatmap_basic_{os.path.basename(image_path).split('.')[0]}_{timestamp}.jpg"
        output_path = os.path.join(output_dir, output_filename)
        
        cv2.imwrite(output_path, superimposed_img)
        
        return {
            "status": "success",
            "path": output_path,
            "fake_score": round(float(fake_score), 2),
            "heatmap_type": "basic"
        }
        
    except Exception as e:
        return {
            "status": "failed",
            "message": f"Error generating basic heatmap: {str(e)}"
        }

def generate_advanced_heatmap(detector, image_path, fake_score):
    """Generate advanced heatmap using GradCAM++ or built-in method"""
    try:
        if hasattr(detector, 'generate_advanced_heatmap'):
            return detector.generate_advanced_heatmap(image_path)
        
        img = cv2.imread(image_path)
        orig_img = img.copy()
        
        input_shape = detector.inputShape
        img = cv2.resize(img, (input_shape[0], input_shape[1]))
        img = img.astype('float32') / 255.0
        img_tensor = np.expand_dims(img, axis=0)
        
        conv_layer = None
        for layer in reversed(detector.model.layers):
            if 'conv' in layer.name.lower():
                conv_layer = layer
                break
        
        if conv_layer is None:
            return generate_basic_heatmap(detector, image_path, fake_score)
        
        grad_model = tf.keras.models.Model(
            inputs=[detector.model.inputs],
            outputs=[conv_layer.output, detector.model.output]
        )
        
        with tf.GradientTape() as tape:
            conv_outputs, predictions = grad_model(img_tensor)
            loss = predictions[:, 0]
        
        grads = tape.gradient(loss, conv_outputs)
        
        pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
        
        conv_outputs = conv_outputs[0]
        heatmap = conv_outputs @ pooled_grads[..., tf.newaxis]
        heatmap = tf.squeeze(heatmap)
        
        heatmap = tf.maximum(heatmap, 0) / tf.math.reduce_max(heatmap)
        heatmap = heatmap.numpy()
        
        heatmap = cv2.resize(heatmap, (orig_img.shape[1], orig_img.shape[0]))
        
        heatmap = np.uint8(255 * heatmap)
        heatmap = cv2.applyColorMap(heatmap, cv2.COLORMAP_VIRIDIS)
        
        superimposed_img = heatmap * 0.4 + orig_img * 0.6
        superimposed_img = np.clip(superimposed_img, 0, 255).astype('uint8')
        
        timestamp = int(time.time())
        output_dir = os.path.dirname(image_path)
        output_filename = f"heatmap_advanced_{os.path.basename(image_path).split('.')[0]}_{timestamp}.jpg"
        output_path = os.path.join(output_dir, output_filename)
        
        cv2.imwrite(output_path, superimposed_img)
        
        return {
            "status": "success",
            "path": output_path,
            "fake_score": round(float(fake_score), 2),
            "heatmap_type": "advanced"
        }
        
    except Exception as e:
        return {
            "status": "failed",
            "message": f"Error generating advanced heatmap: {str(e)}"
        }

def generate_heatmap(image_path, model_path, fake_score=None, advanced=False):
    """
    Generate a heatmap highlighting the areas of the image that contribute most to the deepfake detection.
    
    Args:
        image_path: Path to the input image
        model_path: Path to the trained model
        fake_score: Optional pre-calculated fake score
        advanced: Whether to use advanced heatmap generation
        
    Returns:
        Dictionary with status and path to saved heatmap
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
        
        if advanced and ADVANCED_AVAILABLE:
            # Use the advanced heatmap generator
            try:
                from advancedHeatmapGenerator import generate_advanced_heatmap
                return generate_advanced_heatmap(image_path, model_path, fake_score)
            except ImportError:
                # Fallback to advanced detector's built-in method
                detector = AdvancedDeepfakeDetector(modelPath=model_path)
        else:
            detector = DeepfakeDetector(modelPath=model_path)
        
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
        
        if hasattr(detector, 'generateHeatmap'):
            heatmap_result = detector.generateHeatmap(image_path)
            if heatmap_result.get("status") == "success":
                heatmap_result["heatmap_type"] = "advanced" if advanced else "basic"
                return heatmap_result
        
        if advanced and ADVANCED_AVAILABLE:
            return generate_advanced_heatmap(detector, image_path, fake_score)
        else:
            return generate_basic_heatmap(detector, image_path, fake_score)
            
    except Exception as e:
        return {
            "status": "failed",
            "message": str(e)
        }

def main():
    parser = argparse.ArgumentParser(description='Generate heatmap for deepfake detection')
    parser.add_argument('image_path', help='Path to the input image')
    parser.add_argument('model_path', help='Path to the trained model')
    parser.add_argument('fake_score', nargs='?', type=float, default=None, 
                      help='Optional fake score (0-100)')
    parser.add_argument('--advanced', action='store_true', 
                      help='Use advanced heatmap generation (GradCAM++)')
    
    args = parser.parse_args()
    
    result = generate_heatmap(args.image_path, args.model_path, args.fake_score, args.advanced)
    print(json.dumps(result))

if __name__ == "__main__":
    main()