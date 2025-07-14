#!/usr/bin/env python3
"""
Test pentru debugging autentificarea și salvarea în istoric
"""

import requests
import json
import os
import jwt
import datetime

def create_test_token():
    """Creează un token JWT valid pentru test"""
    secret = "deepfake_secret"
    payload = {
        "userId": 123,
        "email": "test@example.com",
        "username": "test_user",
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    return token

def test_with_real_auth_token():
    """Test cu token JWT valid"""
    print("🔐 TEST CU TOKEN JWT VALID")
    print("="*40)
    
    url = "http://localhost:5000/api/analysis/upload"
    test_image = r"c:\Users\pasti\OneDrive\Desktop\licenta\aplicatie licenta\backend\public\uploads\1_1743760600919.jpeg"
    
    if not os.path.exists(test_image):
        print(f"❌ Fișierul de test nu există: {test_image}")
        return
    
    # Creează token valid
    token = create_test_token()
    print(f"📝 Token generat: {token[:50]}...")
    
    try:
        with open(test_image, 'rb') as f:
            files = {'media': f}
            headers = {
                'Authorization': f'Bearer {token}'
            }
            
            print("🚀 Trimit cererea cu token valid...")
            response = requests.post(url, files=files, headers=headers, timeout=120)
            
        print(f"📊 Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Request reușit!")
            print(f"🎯 Fake Score: {result['result']['fakeScore']}%")
            print(f"🏷️ Tier: {result['tier']['name']}")
            
            # Verifică dacă s-a salvat în baza de date
            if result.get('reportId'):
                print(f"✅ SALVAT în baza de date cu ID: {result['reportId']}")
            else:
                print("❌ NU s-a salvat în baza de date (reportId null)")
                
            # Afișează detaliile complete pentru debugging
            print("\n📋 Răspuns complet:")
            print(json.dumps(result, indent=2, ensure_ascii=False))
                
        else:
            print(f"❌ Eroare: {response.status_code}")
            print(f"📄 Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Excepție: {e}")

def test_authentication_debug():
    """Test endpoint pentru debugging autentificarea"""
    print("\n🔍 TEST DEBUG AUTENTIFICARE")
    print("="*35)
    
    token = create_test_token()
    
    try:
        # Test endpoint pentru verificarea autentificării
        url = "http://localhost:5000/api/auth/profile"
        headers = {
            'Authorization': f'Bearer {token}'
        }
        
        response = requests.get(url, headers=headers, timeout=30)
        
        print(f"📊 Status auth: {response.status_code}")
        
        if response.status_code == 200:
            user_data = response.json()
            print("✅ Token valid, utilizator găsit!")
            print(f"📋 User data: {json.dumps(user_data, indent=2)}")
        else:
            print(f"❌ Probleme cu autentificarea: {response.text}")
            
    except Exception as e:
        print(f"❌ Excepție auth test: {e}")

if __name__ == "__main__":
    print("🧪 TEST DEBUGGING SALVARE ISTORIC")
    print("🎯 Verifică autentificarea și salvarea în baza de date")
    print("="*60)
    
    test_authentication_debug()
    test_with_real_auth_token()
    
    print("\n" + "="*60)
    print("✅ Testele de debugging s-au completat!")
