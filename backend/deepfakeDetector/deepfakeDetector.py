import sys
import cv2
import numpy as np
import tensorflow as tf
import time
from datetime import datetime


model = tf.keras.models.load_model('backend/deepfakeDetector/savedModel')

def detect_deepfake_image(image):
    """Analizează o imagine și returnează probabilitatea de deepfake."""
    try:
        image = cv2.resize(image, (224, 224))
        image = np.expand_dims(image, axis=0)
        image = image / 255.0
        prediction = model.predict(image)
        return prediction[0][0] * 100  
    except Exception as e:
        print(f"Eroare la procesarea imaginii: {e}")
        return None

def detect_deepfake_video(video_path, frame_interval=15):
    """Scanează un videoclip și determină dacă este deepfake."""
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
    else:
        final_fake_score = 0

    
    report = {
        "video_path": video_path,
        "num_frames_analyzed": len(fake_scores),
        "average_fake_score": final_fake_score,
        "processing_time": end_time - start_time,
        "analysis_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    return report

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Utilizare: python deepfakeDetector.py <cale_imagine_sau_video>")
    else:
        file_path = sys.argv[1]
        if file_path.lower().endswith(('.png', '.jpg', '.jpeg')):
            report = detect_deepfake_image(cv2.imread(file_path))
            print(f"Scor fake: {report}%")
        elif file_path.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
            report = detect_deepfake_video(file_path)
            if report:
                print("Raport de analiză video:")
                print(f"📂 Video: {report['video_path']}")
                print(f"📸 Cadre analizate: {report['num_frames_analyzed']}")
                print(f"🔍 Scor mediu fake: {report['average_fake_score']}%")
                print(f"⏳ Timp de procesare: {report['processing_time']} secunde")
                print(f"📅 Data analizei: {report['analysis_time']}")
        else:
            print("Tip de fișier nesuportat!")
