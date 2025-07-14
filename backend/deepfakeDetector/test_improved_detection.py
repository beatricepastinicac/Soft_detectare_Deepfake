#!/usr/bin/env python3
"""
Script de test pentru noul sistem îmbunătățit de detecție deepfake
Testează ensemble-ul de modele și îmbunătățirile de scoring
"""

import os
import sys
import json
import time
import subprocess

def test_detection(image_path, description=""):
    """Testează detectarea pe o imagine și afișează rezultatele"""
    print(f"\n{'='*60}")
    print(f"TEST: {description}")
    print(f"Imagine: {os.path.basename(image_path)}")
    print(f"{'='*60}")
    
    if not os.path.exists(image_path):
        print(f"❌ EROARE: Imaginea {image_path} nu există!")
        return None
    
    # Rulează detectarea
    try:
        result = subprocess.run([
            "python", "deepfakeDetector.py", image_path, "--imageSize", "299"
        ], capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            print(f"❌ EROARE în execuție:")
            print(f"STDERR: {result.stderr}")
            return None
        
        # Parse rezultatul JSON
        try:
            data = json.loads(result.stdout.strip())
        except json.JSONDecodeError as e:
            print(f"❌ EROARE la parsarea JSON: {e}")
            print(f"Output brut: {result.stdout}")
            return None
        
        # Afișează rezultatele
        print(f"🎯 Scor Deepfake: {data.get('fakeScore', 'N/A')}%")
        print(f"🔍 Încredere: {data.get('confidenceScore', 'N/A')}%")
        print(f"⚖️  Verdict: {'DEEPFAKE' if data.get('isDeepfake', False) else 'AUTENTIC'}")
        print(f"⚡ Timp procesare: {data.get('processingTime', 'N/A')}s")
        print(f"🤖 Tip model: {data.get('modelType', 'N/A')}")
        
        if data.get('ensembleUsed', False):
            print(f"🎭 Ensemble folosit: DA ({data.get('modelsUsed', 'N/A')} modele)")
        else:
            print(f"🎭 Ensemble folosit: NU")
        
        # Detalii debug
        debug_info = data.get('debugInfo', {})
        if debug_info:
            print(f"\n📊 Detalii tehnice:")
            if 'ensemble_predictions' in debug_info:
                print(f"   • Predicții individuale: {debug_info['ensemble_predictions']}")
                print(f"   • Nume modele: {debug_info.get('model_names', [])}")
                print(f"   • Ponderi: {debug_info.get('ensemble_weights', [])}")
            print(f"   • Predicție brută: {debug_info.get('prediction_raw', 'N/A')}")
            if 'confidence_methods' in debug_info:
                conf_methods = debug_info['confidence_methods']
                print(f"   • Metodă încredere: {conf_methods.get('method', 'N/A')}")
        
        return data
        
    except subprocess.TimeoutExpired:
        print("❌ TIMEOUT: Detectarea a luat prea mult timp")
        return None
    except Exception as e:
        print(f"❌ EROARE neașteptată: {e}")
        return None

def main():
    print("🚀 Test pentru sistemul îmbunătățit de detecție deepfake")
    print("=" * 70)
    
    # Verifică dacă suntem în directorul corect
    if not os.path.exists("deepfakeDetector.py"):
        print("❌ EROARE: Nu sunt în directorul deepfakeDetector")
        print("Navigați la backend/deepfakeDetector/")
        return
    
    # Verifică modelele disponibile
    models_dir = "savedModel"
    if os.path.exists(models_dir):
        models = [f for f in os.listdir(models_dir) if f.endswith('.keras')]
        print(f"📁 Modele disponibile în {models_dir}:")
        for model in models:
            model_path = os.path.join(models_dir, model)
            size_mb = os.path.getsize(model_path) / (1024*1024)
            print(f"   • {model} ({size_mb:.1f} MB)")
        print()
    else:
        print("⚠️  ATENȚIE: Directorul savedModel nu există!")
        return
    
    # Imagini de test
    test_images = []
    
    # Caută imagini în directorul uploads
    uploads_dir = "../uploads"
    if os.path.exists(uploads_dir):
        for file in os.listdir(uploads_dir):
            if file.lower().endswith(('.jpg', '.jpeg', '.png')):
                test_images.append((os.path.join(uploads_dir, file), f"Upload - {file}"))
    
    # Caută imagini în directorul curent
    for file in os.listdir("."):
        if file.lower().endswith(('.jpg', '.jpeg', '.png')):
            test_images.append((file, f"Local - {file}"))
    
    if not test_images:
        print("❌ Nu s-au găsit imagini de test!")
        print("Adaugă imagini .jpg/.png în directorul curent sau ../uploads/")
        return
    
    # Limitează la primele 3 imagini pentru test rapid
    test_images = test_images[:3]
    
    print(f"🧪 Testez detectarea pe {len(test_images)} imagini...\n")
    
    results = []
    start_time = time.time()
    
    for img_path, description in test_images:
        result = test_detection(img_path, description)
        if result:
            results.append(result)
        time.sleep(0.5)  # Pauză scurtă între teste
    
    total_time = time.time() - start_time
    
    # Sumar final
    print(f"\n{'='*70}")
    print(f"📋 SUMAR FINAL")
    print(f"{'='*70}")
    print(f"Teste completate: {len(results)}/{len(test_images)}")
    print(f"Timp total: {total_time:.2f}s")
    
    if results:
        avg_processing = sum(r.get('processingTime', 0) for r in results) / len(results)
        ensemble_count = sum(1 for r in results if r.get('ensembleUsed', False))
        
        print(f"Timp mediu per imagine: {avg_processing:.2f}s")
        print(f"Teste cu ensemble: {ensemble_count}/{len(results)}")
        
        scores = [r.get('fakeScore', 0) for r in results]
        confidences = [r.get('confidenceScore', 0) for r in results]
        
        print(f"Scor deepfake mediu: {sum(scores)/len(scores):.1f}%")
        print(f"Încredere medie: {sum(confidences)/len(confidences):.1f}%")
        
        print(f"\n🎯 Rezultate individuale:")
        for i, result in enumerate(results):
            verdict = "DEEPFAKE" if result.get('isDeepfake', False) else "AUTENTIC"
            ensemble = "✅" if result.get('ensembleUsed', False) else "❌"
            print(f"   {i+1}. {verdict} ({result.get('fakeScore', 0):.1f}%) - Ensemble: {ensemble}")
    
    print(f"\n✅ Test complet!")

if __name__ == "__main__":
    main()
