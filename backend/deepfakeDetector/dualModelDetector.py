import os
import argparse
import json
import sys
import time
import cv2
import numpy as np

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

try:
    from customModel import DeepfakeDetector
except ImportError:
    try:
        from advancedDeepfakeDetector import AdvancedDeepfakeDetector as DeepfakeDetector
    except ImportError:
        print(json.dumps({
            "error": "Could not import any DeepfakeDetector class.",
            "model_missing": True
        }))
        sys.exit(1)

try:
    from advancedDeepfakeDetector import AdvancedDeepfakeDetector
    ADVANCED_MODEL_AVAILABLE = True
except ImportError:
    ADVANCED_MODEL_AVAILABLE = False

class DualModelDetector:
    def __init__(self, basic_model_path=None, advanced_model_path=None):
        self.basic_model = None
        self.advanced_model = None
        
        if basic_model_path and os.path.exists(basic_model_path):
            try:
                self.basic_model = DeepfakeDetector(modelPath=basic_model_path)
                print(f"Basic model loaded from {basic_model_path}")
            except Exception as e:
                print(f"Error loading basic model: {e}")
        
        if advanced_model_path and os.path.exists(advanced_model_path) and ADVANCED_MODEL_AVAILABLE:
            try:
                self.advanced_model = AdvancedDeepfakeDetector(modelPath=advanced_model_path)
                print(f"Advanced model loaded from {advanced_model_path}")
            except Exception as e:
                print(f"Error loading advanced model: {e}")
    
    def predict(self, image_path, use_advanced=False):
        if use_advanced and self.advanced_model:
            result = self.advanced_model.predict(image_path)
            result["model_type"] = "advanced"
            return result
        elif self.basic_model:
            result = self.basic_model.predict(image_path)
            result["model_type"] = "basic"
            return result
        else:
            return {"error": "No model available", "model_missing": True}

def find_models():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    basic_model_paths = [
        os.path.join(current_dir, 'savedModel', 'model_xception.keras'),
        os.path.join(current_dir, 'savedModel', 'modelXception.keras'),
        os.path.join(current_dir, 'savedModel', 'basic_model.keras'),
    ]
    
    advanced_model_paths = [
        os.path.join(current_dir, 'savedModel', 'advanced_deepfake_model.keras'),
        os.path.join(current_dir, 'savedModel', 'advanced_deepfake_model_final.keras'),
        os.path.join(current_dir, 'savedModel', 'advanced_model.keras'),
    ]
    
    basic_model_path = None
    advanced_model_path = None
    
    for path in basic_model_paths:
        if os.path.exists(path):
            basic_model_path = path
            break
    
    for path in advanced_model_paths:
        if os.path.exists(path):
            advanced_model_path = path
            break
    
    return basic_model_path, advanced_model_path

def main():
    parser = argparse.ArgumentParser(description='Detect deepfakes with dual model system')
    parser.add_argument('inputPath', help='Path to the image to analyze')
    parser.add_argument('--basicModelPath', default=None, help='Path to the basic model')
    parser.add_argument('--advancedModelPath', default=None, help='Path to the advanced model')
    parser.add_argument('--useAdvanced', action='store_true', help='Use advanced model (requires authentication)')
    parser.add_argument('--userAuthenticated', action='store_true', help='User is authenticated')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.inputPath):
        result = {"error": f"Image file not found: {args.inputPath}"}
        print(json.dumps(result))
        sys.exit(1)
    
    basic_model_path = args.basicModelPath
    advanced_model_path = args.advancedModelPath
    
    if not basic_model_path or not advanced_model_path:
        found_basic, found_advanced = find_models()
        if not basic_model_path:
            basic_model_path = found_basic
        if not advanced_model_path:
            advanced_model_path = found_advanced
    
    if not basic_model_path and not advanced_model_path:
        result = {
            "error": "No models found. Please ensure at least one model is available.",
            "model_missing": True
        }
        print(json.dumps(result))
        sys.exit(1)
    
    try:
        start_time = time.time()
        detector = DualModelDetector(basic_model_path, advanced_model_path)
        
        use_advanced = args.useAdvanced and args.userAuthenticated
        
        if use_advanced and not detector.advanced_model:
            result = {
                "error": "Advanced model not available",
                "model_missing": True,
                "fallback_to_basic": True
            }
            use_advanced = False
        
        result = detector.predict(args.inputPath, use_advanced=use_advanced)
        
        if not result.get("processingTime"):
            result["processingTime"] = round(time.time() - start_time, 3)
        
        if not result.get("analysisTime"):
            result["analysisTime"] = time.strftime("%Y-%m-%d %H:%M:%S")
        
        result["authenticated_user"] = args.userAuthenticated
        result["model_used"] = "advanced" if use_advanced else "basic"
        
        print(json.dumps(result))
        
    except Exception as e:
        result = {
            "error": f"Error during detection: {str(e)}"
        }
        print(json.dumps(result))
        sys.exit(1)

if __name__ == "__main__":
    main()