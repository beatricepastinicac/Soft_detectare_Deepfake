#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import jwt
import json
import datetime
from pathlib import Path

# Configurare
API_BASE = "http://localhost:5000/api"
JWT_SECRET = "your-secret-key"

def create_test_token():
    """Crează un token JWT valid pentru test"""
    payload = {
        'userId': 2,
        'email': 'pastinicabeatrice@gmail.com',
        'tier': 'premium',
        'iat': datetime.datetime.utcnow(),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=1)
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
    return token

def test_authenticated_upload():
    """Testează upload-ul cu autentificare"""
    token = create_test_token()
    
    print("🔐 Token generat:", token[:50] + "...")
    
    # Pregătește fișierul pentru upload
    test_file_path = Path(__file__).parent / "backend" / "public" / "uploads" / "1_1743760600919.jpeg"
    
    if not test_file_path.exists():
        print(f"❌ Fișierul de test nu există: {test_file_path}")
        return
    
    headers = {
        'Authorization': f'Bearer {token}'
    }
    
    with open(test_file_path, 'rb') as f:
        files = {'media': f}
        
        print("🚀 Trimit cererea autentificată...")
        response = requests.post(f"{API_BASE}/analysis/upload", 
                               files=files, 
                               headers=headers)
    
    print(f"📊 Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("✅ Request reușit!")
        print(f"🎯 Fake Score: {data.get('result', {}).get('fakeScore', 'N/A')}%")
        print(f"🏷️ Tier: {data.get('tier', {}).get('name', 'N/A')}")
        
        # Verifică dacă s-a salvat în baza de date
        report_id = data.get('reportId')
        if report_id:
            print(f"✅ Salvat în baza de date cu reportId: {report_id}")
        else:
            print("❌ NU s-a salvat în baza de date (reportId null)")
            
    else:
        print("❌ Request eșuat!")
        print("Response:", response.text[:500])

if __name__ == "__main__":
    test_authenticated_upload()
