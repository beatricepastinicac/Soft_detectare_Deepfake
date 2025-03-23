import sys
sys.stdout.reconfigure(encoding='utf-8')
import os
import cv2
import numpy as np
import tensorflow as tf
import time
import json
import traceback
import logging
from datetime import datetime

logs_dir = "logs"
if not os.path.exists(logs_dir):
    os.makedirs(logs_dir)

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("logs/deepfake_detector_debug.log", encoding='utf-8')
    ]
)
logger = logging.getLogger("deepfake_detector")

logger.info(f"Python version: {sys.version}")
logger.info(f"TensorFlow version: {tf.__version__}")
logger.info(f"OpenCV version: {cv2.__version__}")
logger.info(f"NumPy version: {np.__version__}")

logger.info(f"Directorul curent: {os.getcwd()}")
logger.info(f"Argumente sistem: {sys.argv}")

gpus = tf.config.list_physical_devices('GPU')
if gpus:
    logger.info(f"GPU-uri disponibile: {gpus}")
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
        logger.info("Set memory growth enabled for GPUs")
    except RuntimeError as e:
        logger.error(f"Eroare la configurarea GPU: {e}")
else:
    logger.warning("Nu s-au detectat GPU-uri, se va folosi CPU")

MODEL_PATHS = [
    os.path.join(os.getcwd(), 'deepfakeDetector', 'savedModel', 'model_xception.keras'),
    os.path.join(os.getcwd(), 'backend', 'deepfakeDetector', 'savedModel', 'model_xception.keras'),
    'backend/deepfakeDetector/savedModel/model_xception.keras',
    'savedModel/model_xception.keras',
    'backend/deepfakeDetector/savedModel',
    'savedModel',
    '../deepfakeDetector/savedModel/model_xception.keras',
    '../deepfakeDetector/savedModel',
    './deepfakeDetector/savedModel/model_xception.keras',
    './savedModel/model_xception.keras'
]

model = None
for path in MODEL_PATHS:
    abs_path = os.path.abspath(path)
    logger.info(f"Încercarea de a încărca modelul din calea absolută: {abs_path}")
    if os.path.exists(abs_path):
        try:
            if os.access(abs_path, os.R_OK):
                logger.info(f"Avem permisiuni de citire pentru {abs_path}")
                model = tf.keras.models.load_model(abs_path)
                logger.info(f"Modelul a fost încărcat cu succes din {abs_path}")
                break
            else:
                logger.warning(f"Nu avem permisiuni de citire pentru {abs_path}")
        except Exception as e:
            logger.error(f"Eroare la încărcarea modelului din {abs_path}: {e}")
            logger.error(traceback.format_exc())
    else:
        logger.warning(f"Calea {abs_path} nu există")

if model is None:
    logger.critical("Nu s-a putut încărca modelul din nicio cale disponibilă!")
    logger.info("Analiza nu poate continua fără model.")

def detect_deepfake_image(image):
    try:
        logger.info(f"Procesare imagine: {image.shape if image is not None else 'None'}")
        
        if image is None:
            logger.error("Imaginea este None!")
            return None
            
        if len(image.shape) != 3:
            logger.error(f"Format imagine nevalid. Shape: {image.shape}")
            return None
            
        logger.debug(f"Dimensiuni imagine originală: {image.shape}")

        if model is None:
            logger.error("Model absent, analiza nu poate continua!")
            return None

        resized_image = cv2.resize(image, (224, 224))
        logger.debug(f"Dimensiuni imagine redimensionată: {resized_image.shape}")
        
        rgb_image = cv2.cvtColor(resized_image, cv2.COLOR_BGR2RGB)
        logger.debug(f"Dimensiuni imagine după conversie BGR->RGB: {rgb_image.shape}")
        
        expanded_image = np.expand_dims(rgb_image, axis=0)
        logger.debug(f"Dimensiuni imagine după expandare: {expanded_image.shape}")
        
        normalized_image = expanded_image / 255.0
        logger.debug(f"Imagine normalizată, valori min/max: {normalized_image.min()}, {normalized_image.max()}")
        
        if np.isnan(normalized_image).any() or np.isinf(normalized_image).any():
            logger.error("Imaginea conține valori NaN sau Inf după normalizare!")
            return None
        
        logger.info("Predicție model în curs...")
        with tf.io.gfile.GFile('logs/prediction_log.txt', 'w'):
            pass
        prediction = model.predict(normalized_image, verbose=0)
        logger.info(f"Predicție brută: {prediction}")
        
        if prediction is None or len(prediction) == 0:
            logger.error("Predicția este goală!")
            return None
            
        try:
            score = float(prediction[0][0]) * 100
            logger.info(f"Scor deepfake calculat: {score}")
            
            score = max(0, min(100, score))
            return score
        except (IndexError, TypeError) as e:
            logger.error(f"Eroare la procesarea predicției: {e}")
            logger.error(traceback.format_exc())
            return None
            
    except Exception as e:
        logger.error(f"Excepție la procesarea imaginii: {e}")
        logger.error(traceback.format_exc())
        return None

def detect_deepfake_video(video_path, frame_interval=15):
    logger.info(f"Începere analiză video: {video_path}")
    logger.info(f"Interval cadre: {frame_interval}")
    
    if not os.path.exists(video_path):
        logger.error(f"Fișierul video nu există: {video_path}")
        return None
        
    try:
        file_size = os.path.getsize(video_path) / (1024 * 1024)
        logger.info(f"Dimensiune fișier: {file_size:.2f} MB")
        if file_size > 500:
            logger.warning(f"Fișier foarte mare: {file_size:.2f} MB")
    except OSError as e:
        logger.error(f"Eroare la verificarea dimensiunii fișierului: {e}")
    
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Nu s-a putut deschide fișierul video: {video_path}")
            return None

        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        logger.info(f"Info video: {width}x{height}, {fps} FPS, {frame_count} cadre")

        analyzed_frames = 0
        fake_scores = []
        start_time = time.time()

        while True:
            ret, frame = cap.read()
            if not ret:
                logger.debug(f"Sfârșitul videoclipului sau eroare de citire după {analyzed_frames} cadre")
                break
            
            if analyzed_frames % frame_interval == 0:
                logger.debug(f"Analiză cadru {analyzed_frames}")
                fake_score = detect_deepfake_image(frame)
                if fake_score is not None:
                    fake_scores.append(fake_score)
                    logger.debug(f"Scor pentru cadrul {analyzed_frames}: {fake_score}")

            analyzed_frames += 1
            
            if analyzed_frames > 300: 
                logger.info(f"S-a atins limita de cadre analizate: {analyzed_frames}")
                break

        cap.release()
        end_time = time.time()
        
        logger.info(f"Analiză video completă. Cadre analizate: {len(fake_scores)}/{analyzed_frames}")
        
        if len(fake_scores) > 0:
            final_fake_score = np.mean(fake_scores)
            std_dev = np.std(fake_scores)
            confidence_score = 100 - min(std_dev * 2, 50)
            logger.info(f"Scor final: {final_fake_score}, Deviație: {std_dev}, Încredere: {confidence_score}")
            
            is_deepfake = final_fake_score > 50
            
            report = {
                "fileName": os.path.basename(video_path),
                "fake_score": round(final_fake_score, 2),
                "confidence_score": round(confidence_score, 2),
                "is_deepfake": is_deepfake,
                "processing_time": round(end_time - start_time, 2),
                "num_frames_analyzed": len(fake_scores),
                "analysis_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "debug_info": {
                    "total_frames": analyzed_frames,
                    "fps": fps,
                    "resolution": f"{width}x{height}",
                    "model_loaded": model is not None
                }
            }
            
            logger.info(f"Raport final: {json.dumps(report)}")
            return report
        else:
            logger.warning("Nu s-au putut analiza cadre din video!")
            return {"error": "Nu s-au putut analiza cadre din video", "model_missing": model is None}
            
    except Exception as e:
        logger.error(f"Excepție la analiza video: {e}")
        logger.error(traceback.format_exc())
        return {"error": f"Eroare la analiza video: {str(e)}", "model_missing": model is None}

def analyze_file(file_path):
    logger.info(f"Începere analiză fișier: {file_path}")
    start_time = time.time()
    
    if model is None:
        logger.critical("Nu s-a putut încărca modelul. Analiza nu poate continua.")
        return {"error": "Modelul de detectare nu a fost găsit. Contactați administratorul.", "model_missing": True}
    
    if not os.path.exists(file_path):
        logger.error(f"Fișierul nu există: {file_path}")
        return {"error": f"Fișierul {file_path} nu există."}
    
    try:
        if not os.access(file_path, os.R_OK):
            logger.error(f"Nu există permisiuni de citire pentru fișierul: {file_path}")
            return {"error": f"Nu există permisiuni de citire pentru fișierul: {file_path}"}
            
        if os.path.getsize(file_path) == 0:
            logger.error(f"Fișierul {file_path} este gol")
            return {"error": f"Fișierul {file_path} este gol"}
            
        file_extension = os.path.splitext(file_path.lower())[1]
        logger.info(f"Extensie fișier: {file_extension}")
        
        if file_extension in ['.png', '.jpg', '.jpeg']:
            logger.info(f"Procesare imagine: {file_path}")
            try:
                image = cv2.imread(file_path)
                if image is None:
                    logger.error(f"Nu s-a putut citi imaginea: {file_path}")
                    return {"error": f"Nu s-a putut citi imaginea: {file_path}"}
                
                height, width, channels = image.shape
                logger.info(f"Dimensiuni imagine: {width}x{height}x{channels}")
                
                if width < 32 or height < 32:
                    logger.warning(f"Imagine prea mică: {width}x{height}")
                    return {"error": f"Imagine prea mică: {width}x{height}. Dimensiunea minimă este 32x32 pixeli."}
                
                fake_score = detect_deepfake_image(image)
                
                if fake_score is None:
                    logger.error("Eroare la analiza imaginii")
                    return {"error": "Eroare la analiza imaginii. Încercați din nou sau contactați administratorul."}
                
                is_deepfake = fake_score > 50
                end_time = time.time()
                
                size_factor = min(1.0, max(0.5, (width * height) / (1000 * 1000)))
                confidence_score = 75.0 + (size_factor * 20.0)
                
                result = {
                    "fileName": os.path.basename(file_path),
                    "fake_score": round(fake_score, 2),
                    "confidence_score": round(confidence_score, 2),
                    "is_deepfake": is_deepfake,
                    "processing_time": round(end_time - start_time, 2),
                    "analysis_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "debug_info": {
                        "resolution": f"{width}x{height}",
                        "channels": channels,
                        "model_loaded": model is not None
                    }
                }
                
                logger.info(f"Rezultat analiză imagine: {json.dumps(result)}")
                return result
                
            except Exception as e:
                logger.error(f"Excepție la procesarea imaginii: {e}")
                logger.error(traceback.format_exc())
                return {"error": f"Eroare la procesarea imaginii: {str(e)}"}
        
        elif file_extension in ['.mp4', '.avi', '.mov', '.mkv']:
            logger.info(f"Procesare video: {file_path}")
            try:
                report = detect_deepfake_video(file_path)
                if report is None:
                    logger.error("Eroare la analiza videoclipului")
                    return {"error": "Eroare la analiza videoclipului. Încercați din nou sau contactați administratorul."}
                return report
            except Exception as e:
                logger.error(f"Excepție la procesarea videoclipului: {e}")
                logger.error(traceback.format_exc())
                return {"error": f"Eroare la procesarea videoclipului: {str(e)}"}
        
        else:
            logger.error(f"Tip de fișier nesuportat: {file_extension}")
            return {"error": "Tip de fișier nesuportat. Sunt acceptate doar imagini (.jpg, .jpeg, .png) și videoclipuri (.mp4, .avi, .mov, .mkv)."}
            
    except Exception as e:
        logger.error(f"Excepție generală la analiza fișierului: {e}")
        logger.error(traceback.format_exc())
        return {"error": f"Eroare generală la analiza fișierului: {str(e)}"}

if __name__ == "__main__":
    try:
        logger.info(f"Pornire script cu argumentele: {sys.argv}")
        
        if len(sys.argv) != 2:
            logger.error("Număr incorect de argumente")
            print(json.dumps({"error": "Utilizare: python deepfake_detector.py <cale_fisier>"}))
            sys.exit(1)
        
        file_path = sys.argv[1]
        logger.info(f"Procesare fișier: {file_path}")
        
        result = analyze_file(file_path)
        
        print(json.dumps(result))
        logger.info(f"Rezultat JSON returnat: {json.dumps(result)[:200]}...")
            
    except Exception as e:
        logger.critical(f"Excepție neașteptată în main: {e}")
        logger.critical(traceback.format_exc())
        print(json.dumps({"error": f"Eroare critică: {str(e)}"}))
        sys.exit(1)