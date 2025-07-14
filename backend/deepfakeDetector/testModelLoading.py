#!/usr/bin/env python3
import os
import sys
from customModel import DeepfakeDetector

print("Testing model loading...")
print(f"Current directory: {os.getcwd()}")
print(f"savedModel exists: {os.path.exists('savedModel')}")
print(f"model_xception.keras exists: {os.path.exists('savedModel/model_xception.keras')}")

# Test direct path
full_path = os.path.join(os.path.dirname(__file__), "savedModel", "model_xception.keras")
print(f"Full path exists: {os.path.exists(full_path)}")
print(f"Full path: {full_path}")

# Create detector
detector = DeepfakeDetector()
print(f"Model loaded: {detector.model_loaded}")
print(f"Input shape: {detector.inputShape}")
print(f"Use mock predictions: {detector.use_mock_predictions}")
