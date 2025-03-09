import sys
import os
import cv2
import numpy as np
import tensorflow as tf
import time
import json
from datetime import datetime

MODEL_PATH = 'backend/deepfakeDetector/savedModel/model_xception.keras'

try:
    model = tf.keras.models.load_model(MODEL_PATH)
    print(f"Modelul a fost încărcat cu succes din {MODEL_PATH}")
except Exception as e:
    print(f"Eroare la încărcarea modelului din {MODEL_PATH}: {e}")
    try:
        model = tf.keras.models.load_model('backend/deepfakeDetector/savedModel')
        print("Modelul a fost încărcat cu succes din calea alternativă")
    except Exception as e2:
        print(f"Eroare la încărcarea modelului din calea alternativă: {e2}")
        sys.exit(1)

def detect_deepfake_image(image):
    try:
        image = cv2.resize(image, (224, 224))
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        image = np.expand_dims(image, axis=0)
        image = image / 255.0
        prediction = model.predict(image)
        return float(prediction[0][0]) * 100
    except Exception as e:
        print(f"Eroare la procesarea imaginii: {e}")
        return None

def detect_deepfake_video(video_path, frame_interval=15):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("Eroare la deschiderea videoclipului.")
        return None

    frame_count = 0
    fake_scores = []
    start_time = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break  
        
        if frame_count % frame_interval == 0:
            fake_score = detect_deepfake_image(frame)
            if fake_score is not None:
                fake_scores.append(fake_score)

        frame_count += 1

    cap.release()
    end_time = time.time()
    
    if len(fake_scores) > 0:
        final_fake_score = np.mean(fake_scores)
        std_dev = np.std(fake_scores)
        confidence_score = 100 - min(std_dev * 2, 50)
    else:
        final_fake_score = 0
        confidence_score = 0

    is_deepfake = final_fake_score > 50
    
    report = {
        "fileName": os.path.basename(video_path),
        "fake_score": round(final_fake_score, 2),
        "confidence_score": round(confidence_score, 2),
        "is_deepfake": is_deepfake,
        "processing_time": round(end_time - start_time, 2),
        "num_frames_analyzed": len(fake_scores),
        "analysis_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    return report

def analyze_file(file_path):
    start_time = time.time()
    
    if not os.path.exists(file_path):
        return {"error": f"Fișierul {file_path} nu există."}
    
    if file_path.lower().endswith(('.png', '.jpg', '.jpeg')):
        try:
            image = cv2.imread(file_path)
            if image is None:
                return {"error": "Nu s-a putut citi imaginea."}
            
            fake_score = detect_deepfake_image(image)
            if fake_score is None:
                return {"error": "Eroare la analiza imaginii."}
            
            is_deepfake = fake_score > 50
            end_time = time.time()
            
            return {
                "fileName": os.path.basename(file_path),
                "fake_score": round(fake_score, 2),
                "confidence_score": 95.0,
                "is_deepfake": is_deepfake,
                "processing_time": round(end_time - start_time, 2),
                "analysis_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
        except Exception as e:
            return {"error": f"Eroare la procesarea imaginii: {str(e)}"}
    
    elif file_path.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
        try:
            report = detect_deepfake_video(file_path)
            if report is None:
                return {"error": "Eroare la analiza videoclipului."}
            return report
        except Exception as e:
            return {"error": f"Eroare la procesarea videoclipului: {str(e)}"}
    
    else:
        return {"error": "Tip de fișier nesuportat. Sunt acceptate doar imagini (.jpg, .jpeg, .png) și videoclipuri (.mp4, .avi, .mov, .mkv)."}

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Utilizare: python deepfake_detector.py <cale_fisier>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    result = analyze_file(file_path)
    
    print(json.dumps(result))