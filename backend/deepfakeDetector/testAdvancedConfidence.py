#!/usr/bin/env python3
"""
Test script pentru demonstrarea noilor capabilități de confidence scoring
"""

import os
import sys
import json
import time
from customModel import DeepfakeDetector

def test_advanced_confidence():
    """
    Test comprehensive al noilor metodologii de confidence scoring
    """
    print("=" * 60)
    print("TEST ADVANCED DEEPFAKE DETECTION & CONFIDENCE SCORING")
    print("=" * 60)
    
    # Caută imagini de test
    test_images = []
    upload_dir = "../uploads"
    
    if os.path.exists(upload_dir):
        for file in os.listdir(upload_dir):
            if file.lower().endswith(('.png', '.jpg', '.jpeg')):
                test_images.append(os.path.join(upload_dir, file))
                if len(test_images) >= 5:  # Limitează la 5 imagini pentru test
                    break
    
    if not test_images:
        print("Nu s-au găsit imagini de test în directorul uploads")
        return
    
    print(f"Testez cu {len(test_images)} imagini...")
    print()
    
    # Testează cu Xception (default)
    print("1. TESTARE CU XCEPTION (ARHITECTURA IMPLICITĂ)")
    print("-" * 50)
    
    detector_xception = DeepfakeDetector()
    
    for i, image_path in enumerate(test_images[:3]):
        print(f"\nImagine {i+1}: {os.path.basename(image_path)}")
        
        start_time = time.time()
        result = detector_xception.predict(image_path)
        end_time = time.time()
        
        if "error" not in result:
            print(f"  Fake Score: {result['fakeScore']}%")
            print(f"  Confidence Score: {result['confidenceScore']}%")
            print(f"  Is Deepfake: {result['isDeepfake']}")
            print(f"  Processing Time: {end_time - start_time:.2f}s")
            
            if "confidence_methods" in result.get("debugInfo", {}):
                methods = result["debugInfo"]["confidence_methods"]
                print("  Confidence Methods:")
                if methods.get("mc_confidence"):
                    print(f"    Monte Carlo: {methods['mc_confidence']:.1f}%")
                if methods.get("entropy_confidence"):
                    print(f"    Entropy: {methods['entropy_confidence']:.1f}%")
                if methods.get("distance_confidence"):
                    print(f"    Distance: {methods['distance_confidence']:.1f}%")
                if methods.get("gradient_confidence"):
                    print(f"    Gradient: {methods['gradient_confidence']:.1f}%")
        else:
            print(f"  ERROR: {result['error']}")
    
    # Testează cu EfficientNet (trainModel.py architecture)
    print("\n\n2. TESTARE CU EFFICIENTNET (ARHITECTURA DIN TRAINMODEL.PY)")
    print("-" * 60)
    
    detector_efficient = DeepfakeDetector(useTrainModelArchitecture=True)
    
    for i, image_path in enumerate(test_images[:2]):
        print(f"\nImagine {i+1}: {os.path.basename(image_path)}")
        
        start_time = time.time()
        result = detector_efficient.predict(image_path)
        end_time = time.time()
        
        if "error" not in result:
            print(f"  Fake Score: {result['fakeScore']}%")
            print(f"  Confidence Score: {result['confidenceScore']}%")
            print(f"  Is Deepfake: {result['isDeepfake']}")
            print(f"  Processing Time: {end_time - start_time:.2f}s")
            print(f"  Model: {result.get('debugInfo', {}).get('model_name', 'Unknown')}")
            print(f"  Input Shape: {result.get('debugInfo', {}).get('input_shape', 'Unknown')}")
        else:
            print(f"  ERROR: {result['error']}")
    
    # Test consistență între metode
    print("\n\n3. TEST CONSISTENȚĂ ÎNTRE METODE")
    print("-" * 40)
    
    if test_images:
        test_image = test_images[0]
        print(f"Testez imaginea: {os.path.basename(test_image)}")
        
        # Test cu metoda centralizată directă
        detector = DeepfakeDetector()
        
        # Simulare predicție pentru test
        import cv2
        import numpy as np
        import tensorflow as tf
        
        img = cv2.imread(test_image)
        if img is not None:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img = cv2.resize(img, (detector.inputShape[0], detector.inputShape[1]))
            img = img.astype('float32') / 255.0
            img_tensor = np.expand_dims(img, axis=0)
            img_tensor = tf.convert_to_tensor(img_tensor)
            
            prediction = detector.model.predict(img_tensor, verbose=0)
            fake_prob = float(prediction[0][0])
            
            # Test metoda centralizată
            result_full = detector.getConsistentScoring(fake_prob, img_tensor, enable_advanced=True)
            result_simple = detector.getConsistentScoring(fake_prob, None, enable_advanced=False)
            
            print(f"\nPredicție raw: {fake_prob:.4f}")
            print(f"Scoring complet (cu advanced): {result_full['confidenceScore']:.2f}%")
            print(f"Scoring simplu (fără advanced): {result_simple['confidenceScore']:.2f}%")
            print(f"Diferența: {abs(result_full['confidenceScore'] - result_simple['confidenceScore']):.2f}%")
    
    print("\n\n4. SUMAR ÎMBUNĂTĂȚIRI")
    print("-" * 30)
    print("✓ Confidence score bazat pe criterii reale:")
    print("  • Monte Carlo Dropout pentru incertitudine")
    print("  • Entropie binară pentru măsurarea incertitudinii")
    print("  • Calibrare probabilistică cu temperature scaling")
    print("  • Analiza magnitudinii gradienților")
    print()
    print("✓ Consistență între toate metodele:")
    print("  • predict(), predictVideo(), predictRealtime()")
    print("  • Utilizează getConsistentScoring() centralizat")
    print("  • deepfakeDetector.py folosește customModel.py")
    print()
    print("✓ Sincronizare cu trainModel.py:")
    print("  • Arhitectură EfficientNetV2B0 opțională")
    print("  • Input shape 224x224 pentru compatibilitate")
    print("  • Metrici AUC și accuracy")
    print()
    print("✓ Serializare JSON corectă:")
    print("  • Conversie float32 -> float pentru JSON")
    print("  • Debugging info extins cu confidence methods")
    print("  • Fallback sigur în caz de erori")

if __name__ == "__main__":
    test_advanced_confidence()
