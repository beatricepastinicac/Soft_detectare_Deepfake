#!/usr/bin/env python3
import os
import sys
import argparse
import numpy as np
import matplotlib.pyplot as plt
import cv2
import random
from glob import glob
import json

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(current_dir)
sys.path.append(parent_dir)

from sklearn.metrics import roc_curve, auc, precision_recall_curve, confusion_matrix, classification_report
import tensorflow as tf

try:
    from customModel import DeepfakeDetector
except ImportError:
    try:
        from customModel import DeepfakeDetector
    except ImportError:
        print("Nu s-a putut găsi modulul DeepfakeDetector. Asigurați-vă că există fie customModel.py sau custom_model.py")
        sys.exit(1)

class SimpleDataGenerator:
    def __init__(self, directory, batch_size=16, target_size=(224, 224), shuffle=True):
        self.directory = directory
        self.batch_size = batch_size
        self.target_size = target_size
        self.shuffle = shuffle
        
        self.class_indices = {'fake': 1, 'real': 0}
        self.classes = []
        self.filepaths = []
        
        real_dir = os.path.join(directory, 'real')
        fake_dir = os.path.join(directory, 'fake')
        
        real_files = []
        fake_files = []
        
        if os.path.exists(real_dir):
            real_files = glob(os.path.join(real_dir, '*.jpg')) + glob(os.path.join(real_dir, '*.jpeg')) + glob(os.path.join(real_dir, '*.png'))
            self.filepaths.extend(real_files)
            self.classes.extend([0] * len(real_files))
            
        if os.path.exists(fake_dir):
            fake_files = glob(os.path.join(fake_dir, '*.jpg')) + glob(os.path.join(fake_dir, '*.jpeg')) + glob(os.path.join(fake_dir, '*.png'))
            self.filepaths.extend(fake_files)
            self.classes.extend([1] * len(fake_files))
        
        self.samples = len(self.filepaths)
        self.indices = list(range(self.samples))
        self.reset()
        
        print(f"Găsit {len(real_files)} imagini reale și {len(fake_files)} imagini false")
    
    def reset(self):
        if self.shuffle:
            random.shuffle(self.indices)
        self.index = 0
    
    def __next__(self):
        if self.index >= self.samples:
            self.reset()
            raise StopIteration
        
        current_indices = self.indices[self.index:self.index + self.batch_size]
        batch_x = []
        batch_y = []
        
        for i in current_indices:
            try:
                img = cv2.imread(self.filepaths[i])
                if img is None:
                    continue
                
                img = cv2.resize(img, self.target_size)
                img = img.astype('float32') / 255.0
                
                batch_x.append(img)
                batch_y.append(self.classes[i])
            except:
                print(f"Eroare la încărcarea imaginii: {self.filepaths[i]}")
        
        self.index += self.batch_size
        
        if not batch_x:
            return self.__next__()
        
        return np.array(batch_x), np.array(batch_y)
    
    def __iter__(self):
        return self

def evaluate_model(model_path, test_dir, batch_size=16, image_size=(224, 224)):
    print(f"Evaluarea modelului din: {model_path}")
    print(f"Directorul de test: {test_dir}")
    
    detector = DeepfakeDetector(modelPath=model_path)
    model = detector.model

    print("Crearea generatorului de date pentru testare...")
    test_generator = SimpleDataGenerator(
        test_dir,
        batch_size=batch_size,
        target_size=image_size,
        shuffle=False
    )
    
    print("Generarea predicțiilor...")
    y_true = []
    y_pred_prob = []
    
    for batch_x, batch_y in test_generator:
        if len(batch_x) == 0:
            break
        
        batch_pred = model.predict(batch_x)
        y_true.extend(batch_y)
        y_pred_prob.extend(batch_pred.flatten().tolist())
        
        if test_generator.index >= test_generator.samples:
            break
    
    y_true = np.array(y_true)
    y_pred_prob = np.array(y_pred_prob)
    y_pred = (y_pred_prob > 0.5).astype(int)
    
    accuracy = np.mean(y_pred == y_true)
    loss = -np.mean(y_true * np.log(y_pred_prob + 1e-10) + (1 - y_true) * np.log(1 - y_pred_prob + 1e-10))
    
    print(f"Acuratețe testare: {accuracy:.4f}")
    print(f"Loss testare (aproximativ): {loss:.4f}")

    print("Calcularea metricilor de performanță...")
    fpr, tpr, _ = roc_curve(y_true, y_pred_prob)
    roc_auc = auc(fpr, tpr)

    precision, recall, _ = precision_recall_curve(y_true, y_pred_prob)
    pr_auc = auc(recall, precision)

    cm = confusion_matrix(y_true, y_pred)

    os.makedirs('results', exist_ok=True)

    plt.figure(figsize=(12, 10))
    
    plt.subplot(2, 2, 1)
    plt.plot(fpr, tpr, color='darkorange', lw=2, label=f'Curba ROC (aria = {roc_auc:.2f})')
    plt.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--')
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel('Rata Falși Pozitivi')
    plt.ylabel('Rata Adevărat Pozitivi')
    plt.title('Curba ROC')
    plt.legend(loc="lower right")

    plt.subplot(2, 2, 2)
    plt.plot(recall, precision, color='blue', lw=2, label=f'Curba PR (aria = {pr_auc:.2f})')
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel('Recall')
    plt.ylabel('Precision')
    plt.title('Curba Precision-Recall')
    plt.legend(loc="lower left")

    plt.subplot(2, 2, 3)
    plt.imshow(cm, interpolation='nearest', cmap='Blues')
    plt.colorbar()
    plt.xticks([0, 1], ['Real', 'Fake'])
    plt.yticks([0, 1], ['Real', 'Fake'])
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            plt.text(j, i, str(cm[i, j]), ha="center", va="center")
    plt.title('Matricea de Confuzie')
    plt.ylabel('Etichetă Reală')
    plt.xlabel('Etichetă Prezisă')

    plt.subplot(2, 2, 4)
    plt.hist(y_pred_prob[y_true==0], bins=20, alpha=0.5, label='Real')
    plt.hist(y_pred_prob[y_true==1], bins=20, alpha=0.5, label='Fake')
    plt.xlabel('Scor de Predicție')
    plt.ylabel('Număr de Exemple')
    plt.title('Distribuția Scorurilor de Predicție')
    plt.legend()

    plt.tight_layout()
    
    plt.savefig('results/evaluation_metrics.png')
    print(f"Graficele au fost salvate în results/evaluation_metrics.png")
    plt.close()

    report = classification_report(y_true, y_pred, target_names=['Real', 'Fake'])
    print("\nRaport de Clasificare:")
    print(report)
    
    with open('results/classification_report.txt', 'w') as f:
        f.write(f"Loss testare: {loss:.4f}\n")
        f.write(f"Acuratețe testare: {accuracy:.4f}\n")
        f.write(f"ROC AUC: {roc_auc:.4f}\n")
        f.write(f"PR AUC: {pr_auc:.4f}\n\n")
        f.write("Matricea de Confuzie:\n")
        f.write(f"{cm}\n\n")
        f.write("Raport de Clasificare:\n")
        f.write(report)
    
    print(f"Raportul complet a fost salvat în results/classification_report.txt")
    
    tn, fp, fn, tp = cm.ravel()
    sensitivity = tp / (tp + fn) if (tp + fn) > 0 else 0
    specificity = tn / (tn + fp) if (tn + fp) > 0 else 0
    
    print("\nMetrici detaliate:")
    print(f"Sensibilitate (Rata Adevărat Pozitivi): {sensitivity:.4f}")
    print(f"Specificitate (Rata Adevărat Negativi): {specificity:.4f}")
    
    return {
        'accuracy': accuracy,
        'loss': loss,
        'roc_auc': roc_auc,
        'pr_auc': pr_auc,
        'confusion_matrix': cm,
        'sensitivity': sensitivity,
        'specificity': specificity
    }

def analyze_false_positives(model_path, test_dir, output_dir='results/false_positives', image_size=(224, 224)):
    os.makedirs(output_dir, exist_ok=True)
    
    detector = DeepfakeDetector(modelPath=model_path)
    model = detector.model
    
    generator = SimpleDataGenerator(
        test_dir,
        batch_size=1,
        target_size=image_size,
        shuffle=False
    )
    
    file_paths = generator.filepaths
    
    y_true = []
    y_pred = []
    y_scores = []
    
    for batch_x, batch_y in generator:
        if len(batch_x) == 0:
            break
        
        batch_pred = model.predict(batch_x).flatten()
        y_true.extend(batch_y)
        y_scores.extend(batch_pred.tolist())
        y_pred.extend((batch_pred > 0.5).astype(int).tolist())
        
        if generator.index >= generator.samples:
            break
    
    false_positives = []
    false_negatives = []
    
    for i, (true, pred, score) in enumerate(zip(y_true, y_pred, y_scores)):
        if i >= len(file_paths):
            break
            
        if true == 0 and pred == 1:
            false_positives.append((file_paths[i], score))
        elif true == 1 and pred == 0:
            false_negatives.append((file_paths[i], score))
    
    if false_positives:
        with open(os.path.join(output_dir, 'false_positives.txt'), 'w') as f:
            f.write("Falși Pozitivi (Imagini Reale clasificate ca Fake):\n")
            for path, score in false_positives:
                f.write(f"Fișier: {path}, Scor: {score:.4f}\n")
                file_name = os.path.basename(path)
                destination = os.path.join(output_dir, f"FP_{file_name}")
                try:
                    import shutil
                    shutil.copy2(path, destination)
                except Exception as e:
                    print(f"Eroare la copierea fișierului {path}: {e}")
    
    if false_negatives:
        with open(os.path.join(output_dir, 'false_negatives.txt'), 'w') as f:
            f.write("Falși Negativi (Imagini Fake clasificate ca Real):\n")
            for path, score in false_negatives:
                f.write(f"Fișier: {path}, Scor: {score:.4f}\n")
                file_name = os.path.basename(path)
                destination = os.path.join(output_dir, f"FN_{file_name}")
                try:
                    import shutil
                    shutil.copy2(path, destination)
                except Exception as e:
                    print(f"Eroare la copierea fișierului {path}: {e}")
    
    print(f"S-au găsit {len(false_positives)} falși pozitivi și {len(false_negatives)} falși negativi")
    print(f"Rezultatele analizei au fost salvate în {output_dir}")
    
    return {
        'false_positives': len(false_positives),
        'false_negatives': len(false_negatives)
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Evaluează un model de detecție deepfake')
    parser.add_argument('--model_path', type=str, required=True, help='Calea către modelul salvat')
    parser.add_argument('--test_dir', type=str, required=True, help='Directorul cu datele de test (trebuie să conțină subdirectoarele "real" și "fake")')
    parser.add_argument('--batch_size', type=int, default=16, help='Dimensiunea batch-ului pentru evaluare')
    parser.add_argument('--image_size', type=int, default=224, help='Dimensiunea imaginilor (presupunând imagini pătrate)')
    parser.add_argument('--analyze_errors', action='store_true', help='Analizează și salvează falșii pozitivi și falșii negativi')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.model_path):
        print(f"Eroare: Modelul nu a fost găsit la calea: {args.model_path}")
        sys.exit(1)
        
    if not os.path.exists(args.test_dir):
        print(f"Eroare: Directorul de test nu a fost găsit: {args.test_dir}")
        sys.exit(1)
        
    if not (os.path.exists(os.path.join(args.test_dir, 'real')) and os.path.exists(os.path.join(args.test_dir, 'fake'))):
        print(f"Eroare: Directorul de test trebuie să conțină subdirectoarele 'real' și 'fake'")
        sys.exit(1)
    
    image_size = (args.image_size, args.image_size)
    
    results = evaluate_model(args.model_path, args.test_dir, args.batch_size, image_size)
    
    if args.analyze_errors:
        error_analysis = analyze_false_positives(args.model_path, args.test_dir, image_size=image_size)
    
    print("\nRezumat Evaluare:")
    print(f"Acuratețe: {results['accuracy']:.4f}")
    print(f"ROC AUC: {results['roc_auc']:.4f}")
    print(f"PR AUC: {results['pr_auc']:.4f}")
    print(f"Sensibilitate: {results['sensitivity']:.4f}")
    print(f"Specificitate: {results['specificity']:.4f}")
    
    print("\nEvaluare completă. Rezultatele au fost salvate în directorul 'results'.")