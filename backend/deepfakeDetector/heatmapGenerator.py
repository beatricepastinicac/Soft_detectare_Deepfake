import tensorflow as tf
import cv2
import numpy as np
import os

def generate_heatmap(image_path, model_path):
    model = tf.keras.models.load_model(model_path)
    
    img = cv2.imread(image_path)
    if img is None:
        return None
        
    img = cv2.resize(img, (224, 224))
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    
    x = np.expand_dims(img_rgb.astype('float32') / 255.0, axis=0)
    
    xception_model = model.layers[0]
    last_conv_layer = None
    
    for layer in reversed(xception_model.layers):
        if isinstance(layer, tf.keras.layers.Conv2D):
            last_conv_layer = layer
            break
    
    if last_conv_layer is None:
        return None
    
    grad_model = tf.keras.models.Model(
        inputs=model.input,
        outputs=[model.get_layer(last_conv_layer.name).output, model.output]
    )
    
    with tf.GradientTape() as tape:
        conv_outputs, predictions = grad_model(x)
        loss = predictions[:, 0]
    
    output = conv_outputs[0]
    grads = tape.gradient(loss, conv_outputs)[0]
    gate_f = tf.reduce_mean(grads, axis=(0, 1))
    cam = tf.reduce_sum(tf.multiply(output, gate_f), axis=-1).numpy()
    cam = np.maximum(cam, 0)
    
    if np.max(cam) > 0:
        cam = cam / np.max(cam)
    
    cam = cv2.resize(cam, (img.shape[1], img.shape[0]))
    heatmap = cv2.applyColorMap(np.uint8(255 * cam), cv2.COLORMAP_JET)
    superimposed = cv2.addWeighted(img, 0.6, heatmap, 0.4, 0)
    
    heatmap_path = os.path.splitext(image_path)[0] + '_heatmap.jpg'
    cv2.imwrite(heatmap_path, superimposed)
    
    return heatmap_path

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Utilizare: python heatmap_generator.py <imagine> <model>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    model_path = sys.argv[2]
    heatmap_path = generate_heatmap(image_path, model_path)
    
    if heatmap_path:
        print(f"Heatmap generat și salvat la: {heatmap_path}")
    else:
        print("Eroare la generarea heatmap-ului")