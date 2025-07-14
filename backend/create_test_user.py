#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script pentru crearea utilizatorului de test în baza de date
"""

import mysql.connector
import bcrypt
from datetime import datetime

# Configurația bazei de date
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'deepfakedetection'
}

def create_test_user():
    """Creează utilizatorul de test în baza de date"""
    try:
        # Conectare la baza de date
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Verifică dacă utilizatorul există deja
        cursor.execute("SELECT id FROM users WHERE id = 123")
        if cursor.fetchone():
            print("✅ Utilizatorul cu ID 123 există deja în baza de date")
            return True
            
        # Creează utilizatorul de test
        test_user_data = {
            'id': 123,
            'username': 'test_user',
            'email': 'test@example.com',
            'password': bcrypt.hashpw('password123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
            'role': 'premium',
            'tier': 'premium'
        }
        
        # Inserează utilizatorul
        insert_query = """
        INSERT INTO users (id, username, email, password, role, tier)
        VALUES (%(id)s, %(username)s, %(email)s, %(password)s, %(role)s, %(tier)s)
        """
        
        cursor.execute(insert_query, test_user_data)
        conn.commit()
        
        print(f"✅ Utilizatorul de test a fost creat cu succes:")
        print(f"   - ID: {test_user_data['id']}")
        print(f"   - Username: {test_user_data['username']}")
        print(f"   - Email: {test_user_data['email']}")
        print(f"   - Tier: {test_user_data['tier']}")
        
        return True
        
    except mysql.connector.Error as e:
        print(f"❌ Eroare MySQL: {e}")
        return False
    except Exception as e:
        print(f"❌ Eroare neașteptată: {e}")
        return False
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

def verify_user_exists():
    """Verifică dacă utilizatorul există în baza de date"""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, username, email, tier FROM users WHERE id = 123")
        user = cursor.fetchone()
        
        if user:
            print(f"👤 Utilizatorul găsit în baza de date:")
            print(f"   - ID: {user[0]}")
            print(f"   - Username: {user[1]}")
            print(f"   - Email: {user[2]}")
            print(f"   - Tier: {user[3]}")
            return True
        else:
            print("❌ Utilizatorul cu ID 123 nu există în baza de date")
            return False
            
    except mysql.connector.Error as e:
        print(f"❌ Eroare la verificarea utilizatorului: {e}")
        return False
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

def main():
    print("🔧 CREARE UTILIZATOR DE TEST PENTRU AUTENTIFICARE")
    print("=" * 60)
    
    # Verifică dacă utilizatorul există
    if verify_user_exists():
        print("✅ Utilizatorul există deja, nu e nevoie să îl creez din nou")
        return True
    
    # Creează utilizatorul
    print("🆕 Creez utilizatorul de test...")
    if create_test_user():
        print("\n🔍 Verificare finală...")
        return verify_user_exists()
    else:
        return False

if __name__ == "__main__":
    success = main()
    print("\n" + "=" * 60)
    if success:
        print("🎉 UTILIZATORUL DE TEST A FOST CONFIGURAT CU SUCCES!")
        print("🚀 Acum autentificarea ar trebui să funcționeze complet!")
    else:
        print("❌ EROARE LA CONFIGURAREA UTILIZATORULUI DE TEST!")
    print("=" * 60)
