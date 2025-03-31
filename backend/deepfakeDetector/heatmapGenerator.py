import cv2
import numpy as np
import os
import sys
import tensorflow as tf
import traceback

def generate_heatmap(image_path, model_path):
    try:
        if not os.path.exists(image_path):
            print(f"Image does not exist: {image_path}")
            return None
            
        if not os.path.exists(model_path):
            print(f"Model does not exist: {model_path}")
            return None
            
        img = cv2.imread(image_path)
        if img is None:
            print(f"Failed to load image: {image_path}")
            return None
            
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img_resized = cv2.resize(img_rgb, (224, 224))
        img_normalized = img_resized.astype('float32') / 255.0
        
        try:
            model = tf.keras.models.load_model(model_path)
            print(f"Model loaded successfully from {model_path}")
        except Exception as e:
            print(f"Error loading model: {str(e)}")
            return generate_face_aware_heatmap(image_path, img)
        
        try:
            feature_layer = None
            for layer in reversed(model.layers):
                if hasattr(layer, 'output_shape') and len(getattr(layer, 'output_shape', [])) == 4:
                    feature_layer = layer
                    break
                    
            if feature_layer is None:
                print("No suitable feature layer found in the model")
                return generate_face_aware_heatmap(image_path, img)
                
            grad_model = tf.keras.models.Model(
                inputs=model.inputs,
                outputs=[model.get_layer(feature_layer.name).output, model.output]
            )
            
            img_array = np.expand_dims(img_normalized, axis=0)
            
            with tf.GradientTape() as tape:
                conv_outputs, predictions = grad_model(img_array)
                loss = predictions[:, 0]
                
            grads = tape.gradient(loss, conv_outputs)
            
            pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
            
            conv_outputs = conv_outputs[0]
            for i in range(pooled_grads.shape[0]):
                conv_outputs[:, :, i] *= pooled_grads[i]
                
            heatmap = tf.reduce_mean(conv_outputs, axis=-1).numpy()
            
        except Exception as e:
            print(f"Error during gradient computation: {str(e)}")
            try:
                activation_model = tf.keras.models.Model(
                    inputs=model.input,
                    outputs=model.layers[-3].output
                )
                activations = activation_model.predict(np.expand_dims(img_normalized, axis=0))
                heatmap = np.mean(activations[0], axis=-1)
            except Exception as e2:
                print(f"Alternative visualization also failed: {str(e2)}")
                return generate_face_aware_heatmap(image_path, img)
        
        heatmap = np.maximum(heatmap, 0) 
        if np.max(heatmap) > 0:
            heatmap = heatmap / np.max(heatmap)
        
        heatmap = cv2.resize(heatmap, (img.shape[1], img.shape[0]))
        
        heatmap = 1.0 - heatmap
        heatmap = np.power(heatmap, 0.5)
        heatmap = cv2.normalize(heatmap, None, 0, 1, cv2.NORM_MINMAX)
        
        heatmap_colored = cv2.applyColorMap(np.uint8(255 * heatmap), cv2.COLORMAP_JET)
        
        superimposed = cv2.addWeighted(img, 0.6, heatmap_colored, 0.4, 0)
        
        heatmap_path = os.path.splitext(image_path)[0] + '_heatmap.jpg'
        
        public_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(image_path))), 'public')
        heatmaps_dir = os.path.join(public_dir, 'heatmaps')
        
        os.makedirs(heatmaps_dir, exist_ok=True)
        
        filename = os.path.basename(image_path)
        basename = os.path.splitext(filename)[0]
        public_heatmap_path = os.path.join(heatmaps_dir, basename + '_heatmap.jpg')
        
        cv2.imwrite(heatmap_path, superimposed)
        cv2.imwrite(public_heatmap_path, superimposed)
        
        return heatmap_path
            
    except Exception as e:
        print(f"Error generating heatmap: {str(e)}")
        print(traceback.format_exc())
        return None

def generate_face_aware_heatmap(image_path, img):
    print("Generating face-aware heatmap")
    
    face_cascade_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'haarcascade_frontalface_default.xml')
    
    if os.path.exists(face_cascade_path):
        face_cascade = cv2.CascadeClassifier(face_cascade_path)
    else:
        try:
            import urllib.request
            cascade_url = "https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml"
            urllib.request.urlretrieve(cascade_url, face_cascade_path)
            face_cascade = cv2.CascadeClassifier(face_cascade_path)
            print(f"Downloaded face cascade to: {face_cascade_path}")
        except Exception as e:
            print(f"Failed to download face cascade: {str(e)}")
            face_cascade = None
    
    height, width = img.shape[:2]
    mask = np.zeros((height, width), dtype=np.float32)
    
    if face_cascade is not None:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.3, 5)
        
        if len(faces) > 0:
            print(f"Detected {len(faces)} faces in the image")
            
            for (x, y, w, h) in faces:
                face_center_x = x + w // 2
                face_center_y = y + h // 2
                
                eye_y = y + h // 3
                left_eye_x = x + w // 3
                right_eye_x = x + 2 * w // 3
                
                mouth_y = y + 2 * h // 3
                
                nose_y = face_center_y
                
                cv2.circle(mask, (left_eye_x, eye_y), w // 8, 0.9, -1)
                cv2.circle(mask, (right_eye_x, eye_y), w // 8, 0.9, -1)
                
                cv2.ellipse(mask, 
                           (face_center_x, mouth_y),
                           (w // 3, h // 8),
                           0, 0, 360, 0.8, -1)
                
                cv2.circle(mask, (face_center_x, nose_y), w // 10, 0.7, -1)
                
                cv2.ellipse(mask, 
                           (face_center_x, face_center_y),
                           (w // 2, h // 2),
                           0, 0, 360, 0.4, -1)
        else:
            print("No faces detected, using content-based heatmap")
            mask = generate_content_based_heatmap(img)
    else:
        print("Face detector not available, using content-based heatmap")
        mask = generate_content_based_heatmap(img)
    
    mask = cv2.GaussianBlur(mask, (height // 20 * 2 + 1, width // 20 * 2 + 1), 0)
    
    mask = 1.0 - mask
    mask = np.power(mask, 0.5)
    mask = cv2.normalize(mask, None, 0, 1, cv2.NORM_MINMAX)
    
    heatmap_color = cv2.applyColorMap(np.uint8(255 * mask), cv2.COLORMAP_JET)
    superimposed = cv2.addWeighted(img, 0.6, heatmap_color, 0.4, 0)
    
    heatmap_path = os.path.splitext(image_path)[0] + '_heatmap.jpg'
    
    public_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(image_path))), 'public')
    heatmaps_dir = os.path.join(public_dir, 'heatmaps')
    
    os.makedirs(heatmaps_dir, exist_ok=True)
    
    filename = os.path.basename(image_path)
    basename = os.path.splitext(filename)[0]
    public_heatmap_path = os.path.join(heatmaps_dir, basename + '_heatmap.jpg')
    
    cv2.imwrite(heatmap_path, superimposed)
    cv2.imwrite(public_heatmap_path, superimposed)
    
    return heatmap_path

def generate_content_based_heatmap(img):
    print("Generating content-based heatmap")
    
    height, width = img.shape[:2]
    mask = np.zeros((height, width), dtype=np.float32)
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    edges = cv2.Canny(gray, 100, 200)
    
    edges_float = edges.astype(np.float32) / 255.0
    
    dst = cv2.cornerHarris(gray, 2, 3, 0.04)
    dst = cv2.dilate(dst, None)
    dst = cv2.normalize(dst, None, 0, 1, cv2.NORM_MINMAX)
    
    mask = edges_float * 0.5 + dst * 0.5
    
    for y in range(0, height, height // 10):
        for x in range(0, width, width // 10):
            roi = gray[y:min(y + height // 10, height), x:min(x + width // 10, width)]
            if roi.size > 0:
                contrast = np.std(roi)
                if contrast > 30:
                    center_y = y + height // 20
                    center_x = x + width // 20
                    if center_y < height and center_x < width:
                        intensity = min(contrast / 100, 1.0)
                        cv2.circle(mask, (center_x, center_y), width // 40, intensity, -1)
    
    mask = cv2.GaussianBlur(mask, (width // 20 * 2 + 1, height // 20 * 2 + 1), 0)
    
    mask = 1.0 - mask
    mask = np.power(mask, 0.5)
    mask = cv2.normalize(mask, None, 0, 1, cv2.NORM_MINMAX)
    
    return mask

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Invalid arguments")
        sys.exit(1)
    
    image_path = sys.argv[1]
    model_path = sys.argv[2]
    
    print(f"Generating heatmap for: {image_path}")
    print(f"Using model: {model_path}")
    
    heatmap_path = generate_heatmap(image_path, model_path)
    
    if heatmap_path:
        print(heatmap_path)
        sys.exit(0)
    else:
        print("FAILED: Heatmap generation failed")
        sys.exit(1)