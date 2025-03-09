import sys
import json
import librosa
import numpy as np
import warnings
warnings.filterwarnings('ignore')

def analyze_audio(video_path):
    try:
        y, sr = librosa.load(video_path, sr=None)
        
        if len(y) == 0:
            return {"error": "Fișierul nu conține audio"}
        
        features = {}
        
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        features["mfcc_mean"] = float(np.mean(mfccs))
        features["mfcc_std"] = float(np.std(mfccs))
        
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        features["spectral_centroid"] = float(np.mean(spectral_centroids))
        
        zero_crossings = librosa.feature.zero_crossing_rate(y)[0]
        features["zero_crossing_rate"] = float(np.mean(zero_crossings))
        
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo = librosa.beat.tempo(onset_envelope=onset_env, sr=sr)[0]
        features["tempo"] = float(tempo)
        
        typical_values = {
            "mfcc_mean": 0,
            "mfcc_std": 20,
            "spectral_centroid": 2000,
            "zero_crossing_rate": 0.05,
            "tempo": 120
        }
        
        deviations = {}
        for feature, value in features.items():
            if feature in typical_values and typical_values[feature] != 0:
                deviations[feature] = abs((value - typical_values[feature]) / typical_values[feature])
            else:
                deviations[feature] = abs(value)
        
        weights = {
            "mfcc_mean": 1.0,
            "mfcc_std": 1.0,
            "spectral_centroid": 2.0,
            "zero_crossing_rate": 1.5,
            "tempo": 0.5
        }
        
        total_weight = sum(weights.values())
        anomaly_score = sum(deviations.get(feature, 0) * weight for feature, weight in weights.items()) / total_weight
        
        normalized_score = min(100, max(0, anomaly_score * 50))
        
        return {
            "audio_fake_score": normalized_score,
            "features": features,
            "anomalies": deviations
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Utilizare: python audio_analyzer.py <videoclip>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    result = analyze_audio(video_path)
    print(json.dumps(result))