import requests
import os
import json

# Test upload cu noul sistem de heatmap îmbunătățit
def test_upload():
    url = "http://localhost:5000/api/analysis/upload"
    
    # Calea către fișierul de test
    test_file_path = r"c:\Users\pasti\OneDrive\Desktop\licenta\aplicatie licenta\backend\public\uploads\1_1743760600919.jpeg"
    
    if not os.path.exists(test_file_path):
        print(f"❌ Fișierul de test nu există: {test_file_path}")
        return
    
    try:
        # Pregătește fișierul pentru upload
        with open(test_file_path, 'rb') as f:
            files = {'media': f}
            
            # Headers care simulează un utilizator premium logat
            headers = {
                'Authorization': 'Bearer premium_test_token',
                'X-User-ID': 'test_premium_user_123',
                'X-User-Tier': 'premium'
            }
            
            data = {
                'tier': 'premium',
                'userId': 'test_premium_user_123'
            }
            
            print("🔄 Trimit cererea de upload cu utilizator premium mock...")
            response = requests.post(url, files=files, data=data, headers=headers, timeout=300)
            
            print(f"📊 Status cod: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Upload reușit!")
                print(json.dumps(result, indent=2, ensure_ascii=False))
                
                # Verifică dacă heatmap-ul îmbunătățit a fost generat
                if 'heatmapUrl' in result and result.get('enhancedRed'):
                    print(f"🔥 Heatmap îmbunătățit cu roșu generat: {result['heatmapUrl']}")
                    print(f"🎯 Acoperire artefacte: {result.get('artifactCoverage', 'N/A')}%")
                    print(f"📊 Pixeli intensitate mare: {result.get('highIntensityPixels', 'N/A')}")
                elif 'result' in result and 'heatmapUrl' in result['result']:
                    print(f"🔥 Heatmap găsit în result: {result['result']['heatmapUrl']}")
                else:
                    print("⚠️ Nu s-a generat heatmap îmbunătățit (poate fi utilizator gratuit)")
                
            else:
                print(f"❌ Eroare: {response.status_code}")
                print(response.text)
                
    except Exception as e:
        print(f"❌ Excepție la test: {e}")

# Test cu simularea unui utilizator premium prin middleware mock
def test_premium_direct():
    print("\n" + "="*50)
    print("🔥 TEST DIRECT GENERATOR HEATMAP ÎMBUNĂTĂȚIT")
    print("="*50)
    
    test_file_path = r"c:\Users\pasti\OneDrive\Desktop\licenta\aplicatie licenta\backend\public\uploads\1_1743760600919.jpeg"
    
    if os.path.exists(test_file_path):
        print(f"📁 Test cu fișierul: {test_file_path}")
        
        # Test direct wrapper
        import subprocess
        import sys
        
        wrapper_path = r"c:\Users\pasti\OneDrive\Desktop\licenta\aplicatie licenta\backend\deepfakeDetector\enhancedRedHeatmapWrapper.py"
        
        try:
            cmd = [sys.executable, wrapper_path, test_file_path, "--format", "json"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            
            print(f"📊 Return code: {result.returncode}")
            
            if result.returncode == 0:
                lines = result.stdout.split('\n')
                json_line = next((line for line in lines if line.strip().startswith('{')), None)
                
                if json_line:
                    data = json.loads(json_line)
                    print("✅ Generator direct reușit!")
                    print(f"🔥 Output path: {data.get('output_path')}")
                    print(f"🎯 Artifact coverage: {data.get('artifact_coverage_percent')}%")
                    print(f"📊 High intensity pixels: {data.get('high_intensity_pixels')}")
                    print(f"🎨 Heatmap type: {data.get('heatmap_type')}")
                    print(f"📋 Version: {data.get('version')}")
                else:
                    print("⚠️ Nu s-a găsit JSON în output")
                    print(f"STDOUT: {result.stdout}")
            else:
                print(f"❌ Eroare generator: {result.stderr}")
                
        except Exception as e:
            print(f"❌ Excepție test direct: {e}")

if __name__ == "__main__":
    test_upload()
    test_premium_direct()
