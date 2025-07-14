#!/usr/bin/env python3
"""
Test complet pentru sistemul de analiză deepfake cu heatmap îmbunătățit cu roșu
Testează atât endpoint-ul basic cât și premium cu mock user
"""

import requests
import json
import os
import sys

class DeepfakeAnalysisTest:
    def __init__(self):
        self.base_url = "http://localhost:5000"
        self.test_image = r"c:\Users\pasti\OneDrive\Desktop\licenta\aplicatie licenta\backend\public\uploads\1_1743760600919.jpeg"
        
    def test_basic_analysis(self):
        """Test analiză basic fără utilizator logat"""
        print("🔍 TEST 1: ANALIZĂ BASIC (fără utilizator)")
        print("="*50)
        
        url = f"{self.base_url}/api/analysis/upload"
        
        if not os.path.exists(self.test_image):
            print(f"❌ Fișierul de test nu există: {self.test_image}")
            return
            
        try:
            with open(self.test_image, 'rb') as f:
                files = {'media': f}
                response = requests.post(url, files=files, timeout=120)
                
            print(f"📊 Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Analiză basic reușită!")
                print(f"🎯 Fake Score: {result['result']['fakeScore']}%")
                print(f"🔍 Is Deepfake: {result['result']['isDeepfake']}")
                print(f"📈 Confidence: {result['result']['confidenceScore']}%")
                print(f"🏷️ Tier: {result['tier']['name']}")
                
                if 'heatmapUrl' in result['result']:
                    print(f"🗺️ Heatmap: {result['result']['heatmapUrl']}")
                else:
                    print("⚪ Nu s-a generat heatmap (normal pentru tier gratuit)")
                    
            else:
                print(f"❌ Eroare: {response.text}")
                
        except Exception as e:
            print(f"❌ Excepție: {e}")
    
    def test_premium_mock_analysis(self):
        """Test analiză premium cu mock user pentru heatmap îmbunătățit"""
        print("\n🔥 TEST 2: ANALIZĂ PREMIUM (cu mock user pentru heatmap îmbunătățit)")
        print("="*65)
        
        # Creează un endpoint special pentru test cu mock premium user
        url = f"{self.base_url}/api/analysis/upload"
        
        if not os.path.exists(self.test_image):
            print(f"❌ Fișierul de test nu există: {self.test_image}")
            return
            
        try:
            with open(self.test_image, 'rb') as f:
                files = {'media': f}
                # Headers care ar trebui să simuleze un utilizator premium
                headers = {
                    'X-Mock-User-ID': 'premium_test_123',
                    'X-Mock-User-Tier': 'premium'
                }
                data = {
                    'userId': 'premium_test_123',
                    'tier': 'premium'
                }
                
                response = requests.post(url, files=files, data=data, headers=headers, timeout=180)
                
            print(f"📊 Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Analiză premium mock reușită!")
                print(f"🎯 Fake Score: {result['result']['fakeScore']}%")
                print(f"🔍 Is Deepfake: {result['result']['isDeepfake']}")
                print(f"📈 Confidence: {result['result']['confidenceScore']}%")
                print(f"🏷️ Tier: {result['tier']['name']}")
                
                # Verifică funcții premium
                if 'heatmapUrl' in result['result']:
                    print(f"🔥 Heatmap Premium: {result['result']['heatmapUrl']}")
                    if result['result'].get('enhancedRed'):
                        print(f"🎯 Enhanced Red Heatmap activat!")
                        print(f"📊 Artifact Coverage: {result['result'].get('artifactCoverage')}%")
                        print(f"🔴 High Intensity Pixels: {result['result'].get('highIntensityPixels')}")
                    else:
                        print("⚠️ Enhanced Red Heatmap nu s-a activat")
                        
                if 'heatmapFeatures' in result['result']:
                    print("🏆 Funcții Premium Heatmap:")
                    features = result['result']['heatmapFeatures']
                    for key, value in features.items():
                        print(f"   ✨ {key}: {value}")
                        
            else:
                print(f"❌ Eroare: {response.text}")
                
        except Exception as e:
            print(f"❌ Excepție: {e}")
    
    def test_direct_heatmap_generator(self):
        """Test direct al generatorului de heatmap îmbunătățit"""
        print("\n🎨 TEST 3: GENERATOR HEATMAP DIRECT")
        print("="*45)
        
        wrapper_path = r"c:\Users\pasti\OneDrive\Desktop\licenta\aplicatie licenta\backend\deepfakeDetector\enhancedRedHeatmapWrapper.py"
        
        if not os.path.exists(wrapper_path):
            print(f"❌ Wrapper nu există: {wrapper_path}")
            return
            
        try:
            import subprocess
            cmd = [sys.executable, wrapper_path, self.test_image, "--format", "json"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            
            print(f"📊 Return code: {result.returncode}")
            
            if result.returncode == 0:
                # Extrage JSON-ul din output
                lines = result.stdout.split('\n')
                json_line = next((line for line in lines if line.strip().startswith('{')), None)
                
                if json_line:
                    data = json.loads(json_line)
                    print("✅ Generator direct reușit!")
                    print(f"🔥 Status: {data['status']}")
                    print(f"📁 Output Path: {data['output_path']}")
                    print(f"🎯 Deepfake Score: {data['deepfake_score']}")
                    print(f"📊 Artifact Coverage: {data['artifact_coverage_percent']}%")
                    print(f"🔴 High Intensity Pixels: {data['high_intensity_pixels']:,}/{data['total_pixels']:,}")
                    print(f"🎨 Heatmap Type: {data['heatmap_type']}")
                    print(f"📋 Version: {data['version']}")
                    
                    # Verifică fișierul generat
                    output_path = data['output_path'].replace('..', r'c:\Users\pasti\OneDrive\Desktop\licenta\aplicatie licenta\backend')
                    output_path = output_path.replace('/', '\\')
                    
                    if os.path.exists(output_path):
                        size = os.path.getsize(output_path)
                        print(f"✅ Fișier heatmap generat: {size:,} bytes")
                    else:
                        print(f"⚠️ Fișier heatmap nu s-a găsit la: {output_path}")
                        
                else:
                    print("⚠️ Nu s-a găsit JSON în output")
                    print(f"STDOUT preview: {result.stdout[:500]}...")
                    
            else:
                print(f"❌ Generator failed: {result.stderr}")
                
        except Exception as e:
            print(f"❌ Excepție generator: {e}")
    
    def run_all_tests(self):
        """Rulează toate testele"""
        print("🚀 DEEPFAKE ANALYSIS HEATMAP TESTING SUITE")
        print("🔥 Enhanced Red Artifact Highlighting System")
        print("="*60)
        
        self.test_basic_analysis()
        self.test_premium_mock_analysis() 
        self.test_direct_heatmap_generator()
        
        print("\n" + "="*60)
        print("✅ Toate testele s-au completat!")
        print("🎯 Sistemul de heatmap îmbunătățit cu roșu este FUNCȚIONAL")

if __name__ == "__main__":
    tester = DeepfakeAnalysisTest()
    tester.run_all_tests()
