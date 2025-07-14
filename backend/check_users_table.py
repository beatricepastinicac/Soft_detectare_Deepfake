#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script pentru verificarea structurii tabelei users
"""

import mysql.connector

# Configurația bazei de date
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root', 
    'password': '',
    'database': 'deepfakedetection'
}

def check_users_table():
    """Verifică structura tabelei users"""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Verifică structura tabelei users
        cursor.execute("DESCRIBE users")
        columns = cursor.fetchall()
        
        print("📋 Structura tabelei 'users':")
        print("-" * 50)
        for column in columns:
            print(f"   {column[0]} | {column[1]} | {column[2]} | {column[3]} | {column[4]} | {column[5]}")
        
        print("\n🔍 Verificare utilizatori existenți:")
        cursor.execute("SELECT id, username, email FROM users LIMIT 5")
        users = cursor.fetchall()
        
        if users:
            print("   Utilizatori găsiți:")
            for user in users:
                print(f"   - ID: {user[0]}, Username: {user[1]}, Email: {user[2]}")
        else:
            print("   Nu există utilizatori în tabelă")
            
        return True
        
    except mysql.connector.Error as e:
        print(f"❌ Eroare MySQL: {e}")
        return False
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    print("🔍 VERIFICARE STRUCTURĂ TABELĂ USERS")
    print("=" * 60)
    check_users_table()
    print("=" * 60)
