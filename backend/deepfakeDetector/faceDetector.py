import cv2
import numpy as np
import os
import sys
import logging
import json

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("logs/face_detector.log", encoding='utf-8')
    ]
)
logger = logging.getLogger("face_detector")

YUNET_MODEL_PATHS = [
    os.path.join(os.getcwd(), 'deepfakeDetector', 'models', 'face_detection_yunet_2022mar.onnx'),
    os.path.join(os.getcwd(), 'backend', 'deepfakeDetector', 'models', 'face_detection_yunet_2022mar.onnx'),
    'backend/deepfakeDetector/models/face_detection_yunet_2022mar.onnx',
    'deepfakeDetector/models/face_detection_yunet_2022mar.onnx',
    'models/face_detection_yunet_2022mar.onnx',
]

def download_yunet_model():
    """
    Descarcă modelul YuNet dacă nu există deja
    """
    model_dir = os.path.join(os.getcwd(), 'deepfakeDetector', 'models')
    os.makedirs(model_dir, exist_ok=True)
    
    model_path = os.path.join(model_dir, 'face_detection_yunet_2022mar.onnx')
    
    if not os.path.exists(model_path):
        logger.info(f"Modelul YuNet nu există. Se descarcă la: {model_path}")
        try:
            import urllib.request
            url = "https://github.com/opencv/opencv_zoo/raw/master/models/face_detection_yunet/face_detection_yunet_2022mar.onnx"
            urllib.request.urlretrieve(url, model_path)
            logger.info(f"Modelul YuNet a fost descărcat cu succes la {model_path}")
            return model_path
        except Exception as e:
            logger.error(f"Eroare la descărcarea modelului YuNet: {e}")
            return None
    else:
        logger.info(f"Modelul YuNet există deja la {model_path}")
        return model_path

def load_yunet_detector():
    """
    Încarcă detectorul YuNet
    """
    download_yunet_model()
    
    model_path = None
    for path in YUNET_MODEL_PATHS:
        if os.path.exists(path):
            model_path = path
            break
    
    if model_path is None:
        logger.error("Nu s-a găsit modelul YuNet în nicio cale disponibilă!")
        return None
    
    try:
        detector = cv2.FaceDetectorYN.create(
            model_path,
            "",
            (320, 320),
            0.9, 
            0.3,  
            5000  
        )
        logger.info(f"Modelul YuNet a fost încărcat cu succes din {model_path}")
        return detector
    except Exception as e:
        logger.error(f"Eroare la încărcarea modelului YuNet: {e}")
        return None

def detect_faces(image, detector=None):
    """
    Detectează fețe în imagine folosind YuNet
    
    Args:
        image: Imaginea în format OpenCV (np.ndarray)
        detector: Detectorul YuNet preîncărcat (opțional)
        
    Returns:
        Dict cu informații despre fețele detectate
    """
    if detector is None:
        detector = load_yunet_detector()
        
    if detector is None:
        logger.error("Nu s-a putut încărca detectorul YuNet")
        return {"error": "Nu s-a putut încărca detectorul YuNet"}
    
    try:
        height, width, _ = image.shape
        detector.setInputSize((width, height))
        
        _, faces = detector.detect(image)
        
        result = {"faces_detected": 0, "faces": []}
        
        if faces is not None:
            result["faces_detected"] = len(faces)
            
            for face in faces:
                confidence = face[-1]
                bbox = face[:-1].astype(np.int32)
                x, y, w, h = bbox
                
                face_info = {
                    "confidence": float(confidence),
                    "bbox": [int(x), int(y), int(w), int(h)],
                    "center": [int(x + w/2), int(y + h/2)]
                }
                result["faces"].append(face_info)
        
        return result
    except Exception as e:
        logger.error(f"Eroare la detectarea fețelor: {e}")
        return {"error": f"Eroare la detectarea fețelor: {str(e)}"}

def extract_face_regions(image, face_results, expand_factor=0.2):
    """
    Extrage regiunile cu fețe din imagine și le extinde cu un factor dat
    
    Args:
        image: Imaginea în format OpenCV
        face_results: Rezultatele detecției faciale
        expand_factor: Factor pentru extinderea regiunii faciale
        
    Returns:
        Listă de regiuni faciale extrase
    """
    face_regions = []
    
    if "error" in face_results or face_results["faces_detected"] == 0:
        return face_regions
    
    height, width, _ = image.shape
    
    for face in face_results["faces"]:
        x, y, w, h = face["bbox"]
        
        dw = int(w * expand_factor)
        dh = int(h * expand_factor)
        
        x1 = max(0, x - dw)
        y1 = max(0, y - dh)
        x2 = min(width, x + w + dw)
        y2 = min(height, y + h + dh)
        
        face_region = image[y1:y2, x1:x2]
        face_regions.append({
            "region": face_region,
            "bbox": [x1, y1, x2-x1, y2-y1],
            "original_bbox": face["bbox"],
            "confidence": face["confidence"]
        })
    
    return face_regions

def analyze_image_with_yunet(image_path):
    """
    Analizează o imagine folosind YuNet pentru detecția facială
    
    Args:
        image_path: Calea către imagine
        
    Returns:
        Dict cu rezultatele analizei
    """
    try:
        if not os.path.exists(image_path):
            return {"error": f"Imaginea nu există: {image_path}"}
        
        image = cv2.imread(image_path)
        if image is None:
            return {"error": f"Nu s-a putut citi imaginea: {image_path}"}
        
        detector = load_yunet_detector()
        if detector is None:
            return {"error": "Nu s-a putut încărca detectorul YuNet"}
        
        face_results = detect_faces(image, detector)
        
        face_regions = extract_face_regions(image, face_results)
        
        result = {
            "file_name": os.path.basename(image_path),
            "faces_detected": face_results["faces_detected"],
            "faces_info": face_results["faces"],
            "face_regions_extracted": len(face_regions)
        }
        
        return result
    except Exception as e:
        logger.error(f"Eroare la analiza imaginii cu YuNet: {e}")
        return {"error": f"Eroare la analiza imaginii: {str(e)}"}

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Utilizare: python faceDetector.py <cale_imagine>"}))
        sys.exit(1)
    
    image_path = sys.argv[1]
    result = analyze_image_with_yunet(image_path)
    print(json.dumps(result))