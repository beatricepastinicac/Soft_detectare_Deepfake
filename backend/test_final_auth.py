#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test final pentru autentificare cu imagine validă
"""

import jwt
import requests
import json
import time
from datetime import datetime, timedelta
from PIL import Image
import io
import base64

# Configurația pentru a se potrivi cu backend-ul
JWT_SECRET = "b14b24"  # Același secret din .env
BACKEND_URL = "http://localhost:5000"

def create_valid_test_image():
    """Creează o imagine PNG validă pentru test"""
    try:
        # Creează o imagine simplă de 100x100 pixeli
        img = Image.new('RGB', (100, 100), color='red')
        
        # Salvează în buffer
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        
        return img_buffer.getvalue()
    except Exception as e:
        print(f"❌ Eroare la crearea imaginii: {e}")
        return None

def create_test_token():
    """Creează un token JWT pentru testare"""
    try:
        payload = {
            'userId': 123,
            'email': 'test@example.com',
            'username': 'test_user',
            'role': 'user',
            'tier': 'premium',
            'iat': int(time.time()),
            'exp': int(time.time()) + 3600
        }
        
        token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
        print(f"🔐 Token generat cu succes pentru userId: {payload['userId']}")
        return token
        
    except Exception as e:
        print(f"❌ Eroare la generarea token-ului: {e}")
        return None

def test_authenticated_upload():
    """Test complet cu imagine validă și autentificare"""
    print("🧪 TEST AUTENTIFICARE CU IMAGINE VALIDĂ")
    print("=" * 50)
    
    # Generează token
    token = create_test_token()
    if not token:
        return False
    
    # Creează imagine validă
    image_data = create_valid_test_image()
    if not image_data:
        return False
    
    try:
        headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/json'
        }
        
        files = {
            'file': ('test_valid_image.png', image_data, 'image/png')
        }
        
        print(f"🚀 Trimit request cu imagine validă...")
        print(f"📏 Mărime imagine: {len(image_data)} bytes")
        
        response = requests.post(
            f"{BACKEND_URL}/api/analysis/upload",
            files=files,
            headers=headers,
            timeout=60  # Timeout mai mare pentru procesare
        )
        
        print(f"📊 Status: {response.status_code}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"✅ Răspuns primit:")
                
                # Verifică reportId
                if 'reportId' in data and data['reportId']:
                    print(f"🎉 SUCCES! Report salvat cu ID: {data['reportId']}")
                    print(f"📋 Tier utilizator: {data.get('tier', {}).get('name', 'N/A')}")
                    print(f"🔍 Model folosit: {data.get('modelUsed', 'N/A')}")
                    print(f"📊 Rezultat detecție: {data.get('result', {}).get('isDeepfake', 'N/A')}")
                    return True
                else:
                    print(f"❌ PROBLEMĂ: reportId este null")
                    print(f"📄 Răspuns complet:")
                    print(json.dumps(data, indent=2, ensure_ascii=False))
                    return False
                    
            except json.JSONDecodeError as e:
                print(f"❌ Răspuns invalid JSON: {e}")
                print(f"📄 Text răspuns: {response.text[:500]}")
                return False
        else:
            print(f"❌ Request eșuat: {response.status_code}")
            print(f"📄 Răspuns: {response.text}")
            return False
            
    except requests.exceptions.Timeout:
        print(f"⏰ Timeout - procesarea durează prea mult")
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Eroare de rețea: {e}")
        return False
    except Exception as e:
        print(f"❌ Eroare neașteptată: {e}")
        return False

def main():
    print("🔧 TEST FINAL AUTENTIFICARE + SALVARE ISTORIC")
    print("=" * 60)
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    success = test_authenticated_upload()
    
    print("\n" + "=" * 60)
    if success:
        print("🎉 TESTUL A REUȘIT COMPLET!")
        print("✅ Autentificarea funcționează")
        print("✅ Rezultatele se salvează în istoric")
        print("🚀 Problema a fost rezolvată!")
    else:
        print("❌ TESTUL ÎNCĂ NU REUȘEȘTE")
        print("🔧 Verifică log-urile serverului pentru detalii")
    print("=" * 60)
    
    return success

if __name__ == "__main__":
    main()
