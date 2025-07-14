#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de testare pentru fixarea autentificării
Folosește exact același secret JWT ca backend-ul
"""

import jwt
import requests
import json
import time
from datetime import datetime, timedelta

# Configurația pentru a se potrivi cu backend-ul
JWT_SECRET = "b14b24"  # Același secret din .env
BACKEND_URL = "http://localhost:5000"

def create_test_token():
    """Creează un token JWT pentru testare folosind exact același secret ca backend-ul"""
    try:
        # Payload-ul tokenului - se potrivește cu structura așteptată de backend
        payload = {
            'userId': 123,
            'email': 'test@example.com',
            'username': 'test_user',
            'role': 'user',
            'tier': 'premium',
            'iat': int(time.time()),  # issued at
            'exp': int(time.time()) + 3600  # expires în 1 oră
        }
        
        # Generează token-ul folosind același secret ca backend-ul
        token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
        
        print(f"🔐 Token generat cu succes")
        print(f"📋 Payload: {json.dumps(payload, indent=2)}")
        print(f"🔑 Secret folosit: {JWT_SECRET}")
        print(f"🎫 Token: {token[:50]}...")
        
        # Verifică dacă token-ul poate fi decodat cu același secret
        try:
            decoded = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            print(f"✅ Token verificat local cu succes: {decoded}")
        except Exception as verify_error:
            print(f"❌ Eroare la verificarea locală: {verify_error}")
            return None
            
        return token
        
    except Exception as e:
        print(f"❌ Eroare la generarea token-ului: {e}")
        return None

def test_upload_with_auth(token):
    """Testează upload-ul cu autentificare"""
    try:
        # Headers cu token-ul de autentificare
        headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/json'
        }
        
        # Creează un fișier de test simplu
        test_image_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\nIDATx\x9cc\xf8\x0f\x00\x00\x01\x00\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {
            'file': ('test_auth_image.png', test_image_content, 'image/png')
        }
        
        print(f"\n🚀 Testez upload-ul cu autentificare...")
        print(f"📡 URL: {BACKEND_URL}/api/analysis/upload")
        print(f"🔑 Authorization: Bearer {token[:30]}...")
        
        response = requests.post(
            f"{BACKEND_URL}/api/analysis/upload",
            files=files,
            headers=headers,
            timeout=30
        )
        
        print(f"📊 Status: {response.status_code}")
        print(f"📄 Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"✅ Răspuns JSON:")
                print(json.dumps(data, indent=2, ensure_ascii=False))
                
                # Verifică dacă s-a salvat în baza de date
                if 'reportId' in data and data['reportId']:
                    print(f"🎉 SUCCES! Report salvat cu ID: {data['reportId']}")
                    return True
                else:
                    print(f"❌ EȘEC: reportId este null sau lipsește")
                    print(f"🔍 Câmpuri disponibile: {list(data.keys())}")
                    return False
                    
            except json.JSONDecodeError as e:
                print(f"❌ Răspunsul nu este JSON valid: {e}")
                print(f"📄 Text răspuns: {response.text[:500]}...")
                return False
        else:
            print(f"❌ Request eșuat cu status {response.status_code}")
            print(f"📄 Răspuns: {response.text[:500]}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Eroare de rețea: {e}")
        return False
    except Exception as e:
        print(f"❌ Eroare neașteptată: {e}")
        return False

def test_token_verification():
    """Testează direct verificarea token-ului"""
    token = create_test_token()
    if not token:
        return False
        
    try:
        # Testează endpoint-ul de verificare dacă există
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        print(f"\n🔍 Testez verificarea token-ului...")
        
        # Încearcă un endpoint simplu care folosește autentificare
        response = requests.get(
            f"{BACKEND_URL}/api/user/profile",  # Endpoint de test
            headers=headers,
            timeout=10
        )
        
        print(f"📊 Status verificare token: {response.status_code}")
        if response.status_code != 404:  # 404 e OK dacă endpoint-ul nu există
            print(f"📄 Răspuns: {response.text[:200]}")
            
    except requests.exceptions.RequestException:
        print(f"⚠️ Endpoint de verificare nu este disponibil, continuăm cu testul de upload...")
    
    return test_upload_with_auth(token)

def main():
    """Funcția principală de test"""
    print("=" * 60)
    print("🧪 TEST DE AUTENTIFICARE JWT - VERIFICARE SECRETULUI")
    print("=" * 60)
    print(f"⏰ Timestamp: {datetime.now().isoformat()}")
    print(f"🔑 Secret JWT folosit: {JWT_SECRET}")
    print(f"🌐 Backend URL: {BACKEND_URL}")
    print()
    
    # Verifică dacă backend-ul rulează
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=5)
        if response.status_code == 200:
            print(f"✅ Backend-ul rulează și răspunde")
        else:
            print(f"⚠️ Backend rulează dar status neașteptat: {response.status_code}")
    except requests.exceptions.RequestException:
        try:
            # Încearcă endpoint-ul principal
            response = requests.get(f"{BACKEND_URL}/", timeout=5)
            print(f"✅ Backend-ul este activ (status: {response.status_code})")
        except requests.exceptions.RequestException as e:
            print(f"❌ Backend-ul nu răspunde: {e}")
            print(f"🔧 Asigură-te că serverul rulează pe {BACKEND_URL}")
            return False
    
    # Rulează testul de autentificare
    success = test_token_verification()
    
    print("\n" + "=" * 60)
    if success:
        print("🎉 TESTUL A FOST FINALIZAT CU SUCCES!")
        print("✅ Autentificarea funcționează și rezultatele se salvează în istoric")
    else:
        print("❌ TESTUL A EȘUAT!")
        print("🔧 Verifică configurația JWT și secretul din .env")
    print("=" * 60)
    
    return success

if __name__ == "__main__":
    main()
