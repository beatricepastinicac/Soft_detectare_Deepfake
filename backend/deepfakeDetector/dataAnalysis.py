import os
import cv2
import numpy as np
import matplotlib.pyplot as plt
from collections import defaultdict
import pandas as pd
import json

def comprehensive_data_analysis(data_dir):
    print("="*60)
    print("ANALIZA COMPLETA CALITATE DATE")
    print("="*60)
    
    stats = {
        'real': {
            'images': {'count': 0, 'corrupted': 0, 'sizes': [], 'blur_scores': []},
            'videos': {'count': 0, 'corrupted': 0, 'durations': [], 'fps': []}
        },
        'fake': {
            'images': {'count': 0, 'corrupted': 0, 'sizes': [], 'blur_scores': []},
            'videos': {'count': 0, 'corrupted': 0, 'durations': [], 'fps': []}
        }
    }
    
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    
    for label in ['real', 'fake']:
        print(f"\nAnalizam clasa: {label}")
        label_path = os.path.join(data_dir, label)
        
        if not os.path.exists(label_path):
            print(f"  ATENTIE: Nu exista directorul {label_path}")
            continue
        
        for root, dirs, files in os.walk(label_path):
            for file in files:
                file_path = os.path.join(root, file)
                
                if file.lower().endswith(('.jpg', '.jpeg', '.png')):
                    try:
                        img = cv2.imread(file_path)
                        if img is None:
                            stats[label]['images']['corrupted'] += 1
                            continue
                        
                        stats[label]['images']['count'] += 1
                        stats[label]['images']['sizes'].append(img.shape[:2])
                        
                        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                        blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
                        stats[label]['images']['blur_scores'].append(blur_score)
                        
                    except Exception as e:
                        stats[label]['images']['corrupted'] += 1
                
                elif file.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
                    try:
                        cap = cv2.VideoCapture(file_path)
                        if cap.isOpened():
                            fps = cap.get(cv2.CAP_PROP_FPS)
                            frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                            duration = frame_count / fps if fps > 0 else 0
                            
                            stats[label]['videos']['count'] += 1
                            stats[label]['videos']['fps'].append(fps)
                            stats[label]['videos']['durations'].append(duration)
                            
                            cap.release()
                        else:
                            stats[label]['videos']['corrupted'] += 1
                    except:
                        stats[label]['videos']['corrupted'] += 1
    
    print("\n" + "="*60)
    print("REZULTATE ANALIZA")
    print("="*60)
    
    for label in ['real', 'fake']:
        print(f"\nClasa {label}:")
        print(f"  IMAGINI:")
        print(f"    - Total valide: {stats[label]['images']['count']}")
        print(f"    - Corupte: {stats[label]['images']['corrupted']}")
        
        if stats[label]['images']['sizes']:
            sizes = np.array(stats[label]['images']['sizes'])
            blur_scores = np.array(stats[label]['images']['blur_scores'])
            
            print(f"    - Dimensiuni (HxW):")
            print(f"      Min: {np.min(sizes, axis=0)}")
            print(f"      Max: {np.max(sizes, axis=0)}")
            print(f"      Medie: {np.mean(sizes, axis=0).astype(int)}")
            
            print(f"    - Blur scores:")
            print(f"      Min: {np.min(blur_scores):.2f}")
            print(f"      Max: {np.max(blur_scores):.2f}")
            print(f"      Medie: {np.mean(blur_scores):.2f}")
            print(f"      Imagini cu blur excesiv (<50): {np.sum(blur_scores < 50)}")
        
        print(f"  VIDEO-URI:")
        print(f"    - Total valide: {stats[label]['videos']['count']}")
        print(f"    - Corupte: {stats[label]['videos']['corrupted']}")
        
        if stats[label]['videos']['durations']:
            durations = np.array(stats[label]['videos']['durations'])
            fps_values = np.array(stats[label]['videos']['fps'])
            
            print(f"    - Durate (secunde):")
            print(f"      Min: {np.min(durations):.2f}")
            print(f"      Max: {np.max(durations):.2f}")
            print(f"      Medie: {np.mean(durations):.2f}")
            
            print(f"    - FPS:")
            print(f"      Min: {np.min(fps_values):.2f}")
            print(f"      Max: {np.max(fps_values):.2f}")
            print(f"      Medie: {np.mean(fps_values):.2f}")
    
    total_real = stats['real']['images']['count'] + stats['real']['videos']['count'] * 20
    total_fake = stats['fake']['images']['count'] + stats['fake']['videos']['count'] * 20
    
    print(f"\nTOTAL ESTIMAT (cu extragere frames):")
    print(f"  Real: ~{total_real} samples")
    print(f"  Fake: ~{total_fake} samples")
    print(f"  Dezechilibru: {max(total_real, total_fake) / max(min(total_real, total_fake), 1):.2f}:1")
    
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    
    if stats['real']['images']['sizes'] and stats['fake']['images']['sizes']:
        real_sizes = np.array(stats['real']['images']['sizes'])
        fake_sizes = np.array(stats['fake']['images']['sizes'])
        
        axes[0, 0].hist([real_sizes[:, 0], fake_sizes[:, 0]], bins=30, label=['Real', 'Fake'], alpha=0.7)
        axes[0, 0].set_title('Distributie inaltimi imagini')
        axes[0, 0].set_xlabel('Inaltime (pixeli)')
        axes[0, 0].set_ylabel('Frecventa')
        axes[0, 0].legend()
        
        axes[0, 1].hist([real_sizes[:, 1], fake_sizes[:, 1]], bins=30, label=['Real', 'Fake'], alpha=0.7)
        axes[0, 1].set_title('Distributie latimi imagini')
        axes[0, 1].set_xlabel('Latime (pixeli)')
        axes[0, 1].set_ylabel('Frecventa')
        axes[0, 1].legend()
    
    if stats['real']['images']['blur_scores'] and stats['fake']['images']['blur_scores']:
        real_blur = np.array(stats['real']['images']['blur_scores'])
        fake_blur = np.array(stats['fake']['images']['blur_scores'])
        
        axes[1, 0].hist([real_blur, fake_blur], bins=50, label=['Real', 'Fake'], alpha=0.7)
        axes[1, 0].axvline(x=50, color='r', linestyle='--', label='Prag blur')
        axes[1, 0].set_title('Distributie blur scores')
        axes[1, 0].set_xlabel('Blur score')
        axes[1, 0].set_ylabel('Frecventa')
        axes[1, 0].legend()
    
    data_counts = [
        stats['real']['images']['count'],
        stats['fake']['images']['count'],
        stats['real']['videos']['count'],
        stats['fake']['videos']['count']
    ]
    labels = ['Real\nImages', 'Fake\nImages', 'Real\nVideos', 'Fake\nVideos']
    
    axes[1, 1].bar(labels, data_counts)
    axes[1, 1].set_title('Distributie tipuri de date')
    axes[1, 1].set_ylabel('Numar fisiere')
    
    for i, v in enumerate(data_counts):
        axes[1, 1].text(i, v + 0.5, str(v), ha='center', va='bottom')
    
    plt.tight_layout()
    plt.savefig('data_quality_analysis.png', dpi=150)
    plt.close()
    
    return stats

def check_face_detection_rate(data_dir, sample_size=100):
    print("\n" + "="*60)
    print("VERIFICARE RATA DETECTIE FETE")
    print("="*60)
    
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    
    results = {'real': {'with_faces': 0, 'without_faces': 0, 'multiple_faces': 0},
               'fake': {'with_faces': 0, 'without_faces': 0, 'multiple_faces': 0}}
    
    for label in ['real', 'fake']:
        print(f"\nVerificam {sample_size} imagini din clasa {label}...")
        
        image_paths = []
        for root, dirs, files in os.walk(os.path.join(data_dir, label)):
            for file in files:
                if file.lower().endswith(('.jpg', '.jpeg', '.png')):
                    image_paths.append(os.path.join(root, file))
        
        np.random.shuffle(image_paths)
        image_paths = image_paths[:sample_size]
        
        for img_path in image_paths:
            try:
                img = cv2.imread(img_path)
                if img is None:
                    continue
                
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, 1.1, 4)
                
                if len(faces) == 0:
                    results[label]['without_faces'] += 1
                elif len(faces) == 1:
                    results[label]['with_faces'] += 1
                else:
                    results[label]['multiple_faces'] += 1
            except:
                pass
    
    print("\nREZULTATE:")
    for label in ['real', 'fake']:
        total = sum(results[label].values())
        if total > 0:
            print(f"\n{label.upper()}:")
            print(f"  Cu o fata: {results[label]['with_faces']} ({results[label]['with_faces']/total*100:.1f}%)")
            print(f"  Fara fete: {results[label]['without_faces']} ({results[label]['without_faces']/total*100:.1f}%)")
            print(f"  Multiple fete: {results[label]['multiple_faces']} ({results[label]['multiple_faces']/total*100:.1f}%)")
    
    return results

def analyze_training_log(log_file='training_log.csv'):
    print("\n" + "="*60)
    print("ANALIZA LOG ANTRENARE")
    print("="*60)
    
    if not os.path.exists(log_file):
        print(f"Nu s-a gasit fisierul {log_file}")
        return None
    
    df = pd.read_csv(log_file)
    
    print("\nPrimele 5 epoci:")
    print(df.head())
    
    print("\nUltimele 5 epoci:")
    print(df.tail())
    
    print("\nStatistici generale:")
    print(df.describe())
    
    probleme = []
    
    if df['accuracy'].iloc[-1] < 0.6:
        probleme.append("Acuratete finala sub 60%")
    
    if df['val_accuracy'].max() < 0.55:
        probleme.append("Acuratete validare nu depaseste 55%")
    
    if abs(df['accuracy'].iloc[-1] - df['val_accuracy'].iloc[-1]) > 0.2:
        probleme.append("Diferenta mare intre acuratete train si validare (overfitting)")
    
    if df['val_loss'].iloc[-5:].std() < 0.001:
        probleme.append("Loss-ul de validare nu mai scade (platou)")
    
    if 'val_precision' in df.columns and 'val_recall' in df.columns:
        if df['val_precision'].iloc[-1] == 0 or df['val_recall'].iloc[-1] == 0:
            probleme.append("Precision sau Recall este 0 (modelul prezice doar o clasa)")
    
    print("\nPROBLEME IDENTIFICATE:")
    if probleme:
        for p in probleme:
            print(f"  - {p}")
    else:
        print("  Nu s-au identificat probleme majore")
    
    fig, axes = plt.subplots(2, 2, figsize=(12, 8))
    
    axes[0, 0].plot(df['accuracy'], label='Train', linewidth=2)
    axes[0, 0].plot(df['val_accuracy'], label='Validation', linewidth=2)
    axes[0, 0].set_title('Accuracy Evolution')
    axes[0, 0].set_xlabel('Epoch')
    axes[0, 0].set_ylabel('Accuracy')
    axes[0, 0].legend()
    axes[0, 0].grid(True, alpha=0.3)
    
    axes[0, 1].plot(df['loss'], label='Train', linewidth=2)
    axes[0, 1].plot(df['val_loss'], label='Validation', linewidth=2)
    axes[0, 1].set_title('Loss Evolution')
    axes[0, 1].set_xlabel('Epoch')
    axes[0, 1].set_ylabel('Loss')
    axes[0, 1].legend()
    axes[0, 1].grid(True, alpha=0.3)
    
    if 'precision' in df.columns:
        axes[1, 0].plot(df['precision'], label='Train Precision', linewidth=2)
        axes[1, 0].plot(df['val_precision'], label='Val Precision', linewidth=2)
        axes[1, 0].plot(df['recall'], label='Train Recall', linewidth=2)
        axes[1, 0].plot(df['val_recall'], label='Val Recall', linewidth=2)
        axes[1, 0].set_title('Precision & Recall')
        axes[1, 0].set_xlabel('Epoch')
        axes[1, 0].set_ylabel('Score')
        axes[1, 0].legend()
        axes[1, 0].grid(True, alpha=0.3)
    
    axes[1, 1].plot(df['learning_rate'], linewidth=2)
    axes[1, 1].set_title('Learning Rate Schedule')
    axes[1, 1].set_xlabel('Epoch')
    axes[1, 1].set_ylabel('Learning Rate')
    axes[1, 1].set_yscale('log')
    axes[1, 1].grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('training_analysis.png', dpi=150)
    plt.close()
    
    return df

def generate_recommendations(stats, face_results, training_df=None):
    print("\n" + "="*60)
    print("RECOMANDARI PENTRU IMBUNATATIRE")
    print("="*60)
    
    recommendations = []
    
    total_real = stats['real']['images']['count'] + stats['real']['videos']['count'] * 20
    total_fake = stats['fake']['images']['count'] + stats['fake']['videos']['count'] * 20
    
    if total_real < 1000 or total_fake < 1000:
        recommendations.append({
            'problem': 'Dataset prea mic',
            'solution': 'Adauga mai multe date. Minim 5000 imagini per clasa pentru rezultate bune.'
        })
    
    imbalance = max(total_real, total_fake) / max(min(total_real, total_fake), 1)
    if imbalance > 2:
        recommendations.append({
            'problem': f'Dezechilibru sever intre clase ({imbalance:.1f}:1)',
            'solution': 'Foloseste data augmentation pentru clasa minoritara sau subsampling pentru cea majoritara.'
        })
    
    if face_results:
        for label in ['real', 'fake']:
            total = sum(face_results[label].values())
            if total > 0:
                face_rate = face_results[label]['with_faces'] / total
                if face_rate < 0.5:
                    recommendations.append({
                        'problem': f'Rata scazuta de detectie fete in clasa {label} ({face_rate*100:.1f}%)',
                        'solution': 'Foloseste un detector de fete mai avansat (MTCNN, RetinaFace) sau filtreaza manual datele.'
                    })
    
    for label in ['real', 'fake']:
        if stats[label]['images']['sizes']:
            sizes = np.array(stats[label]['images']['sizes'])
            if np.std(sizes[:, 0]) > 50 or np.std(sizes[:, 1]) > 50:
                recommendations.append({
                    'problem': f'Variatie mare in dimensiunile imaginilor pentru clasa {label}',
                    'solution': 'Standardizeaza toate imaginile la aceeasi dimensiune (224x224) inainte de antrenare.'
                })
    
    if training_df is not None:
        if training_df['val_accuracy'].max() < 0.55:
            recommendations.append({
                'problem': 'Model stuck la 50% accuracy',
                'solution': 'Verifica etichetele datelor, foloseste o arhitectura mai complexa sau date de calitate mai buna.'
            })
        
        if 'val_precision' in training_df.columns and 'val_recall' in training_df.columns:
            if training_df['val_precision'].iloc[-1] == 0 or training_df['val_recall'].iloc[-1] == 0:
                recommendations.append({
                    'problem': 'Modelul prezice doar o clasa',
                    'solution': 'Verifica balansarea claselor in generatori, ajusteaza class_weights sau pragul de decizie.'
                })
    
    blur_threshold = 50
    for label in ['real', 'fake']:
        if stats[label]['images']['blur_scores']:
            blur_scores = np.array(stats[label]['images']['blur_scores'])
            blurry_ratio = np.sum(blur_scores < blur_threshold) / len(blur_scores)
            if blurry_ratio > 0.2:
                recommendations.append({
                    'problem': f'Multe imagini blurate in clasa {label} ({blurry_ratio*100:.1f}%)',
                    'solution': 'Filtreaza imaginile cu blur score < 50 sau foloseste tehnici de image sharpening.'
                })
    
    print("\nRECOMANDARI:")
    for i, rec in enumerate(recommendations, 1):
        print(f"\n{i}. PROBLEMA: {rec['problem']}")
        print(f"   SOLUTIE: {rec['solution']}")
    
    if not recommendations:
        print("\nDataset-ul pare sa fie in regula!")
    
    return recommendations

def save_analysis_report(data_dir, stats, face_results, recommendations, training_df=None):
    report = {
        'data_directory': data_dir,
        'analysis_date': pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S'),
        'summary': {
            'real_images': stats['real']['images']['count'],
            'fake_images': stats['fake']['images']['count'],
            'real_videos': stats['real']['videos']['count'],
            'fake_videos': stats['fake']['videos']['count'],
            'estimated_real_total': stats['real']['images']['count'] + stats['real']['videos']['count'] * 20,
            'estimated_fake_total': stats['fake']['images']['count'] + stats['fake']['videos']['count'] * 20
        },
        'face_detection_rates': face_results,
        'recommendations': recommendations,
        'training_issues': []
    }
    
    if training_df is not None:
        report['training_issues'] = [
            f"Final accuracy: {training_df['accuracy'].iloc[-1]:.4f}",
            f"Final val_accuracy: {training_df['val_accuracy'].iloc[-1]:.4f}",
            f"Max val_accuracy: {training_df['val_accuracy'].max():.4f}"
        ]
    
    with open('data_quality_report.json', 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    with open('data_quality_report.txt', 'w', encoding='utf-8') as f:
        f.write("RAPORT CALITATE DATE\n")
        f.write(f"Data: {report['analysis_date']}\n")
        f.write(f"Director analizat: {data_dir}\n\n")
        
        f.write("SUMAR:\n")
        f.write(f"- Total estimat imagini Real: {report['summary']['estimated_real_total']}\n")
        f.write(f"- Total estimat imagini Fake: {report['summary']['estimated_fake_total']}\n\n")
        
        f.write("RECOMANDARI:\n")
        for rec in recommendations:
            f.write(f"- {rec['problem']}: {rec['solution']}\n")

def main():
    current_dir = os.getcwd()
    data_dir = None
    
    possible_dirs = [
        os.path.join(current_dir, "dataSet"),
        os.path.join(current_dir, "backend", "deepfakeDetector", "dataSet"),
        os.path.join(current_dir, "..", "dataSet")
    ]
    
    for dir_path in possible_dirs:
        if os.path.exists(dir_path):
            data_dir = dir_path
            break
    
    if not data_dir:
        print("EROARE: Nu s-a gasit directorul cu date!")
        return
    
    print(f"Analizam datele din: {data_dir}")
    
    stats = comprehensive_data_analysis(data_dir)
    
    face_results = check_face_detection_rate(data_dir, sample_size=100)
    
    training_df = None
    if os.path.exists('training_log.csv'):
        training_df = analyze_training_log('training_log.csv')
    
    recommendations = generate_recommendations(stats, face_results, training_df)
    
    save_analysis_report(data_dir, stats, face_results, recommendations, training_df)
    
    print("\n" + "="*60)
    print("ANALIZA COMPLETA!")
    print("Vezi fisierele generate:")
    print("- data_quality_analysis.png")
    print("- training_analysis.png") 
    print("- data_quality_report.txt")
    print("- data_quality_report.json")
    print("="*60)

if __name__ == "__main__":
    main()