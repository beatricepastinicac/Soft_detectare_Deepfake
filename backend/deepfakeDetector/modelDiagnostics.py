import tensorflow as tf
import numpy as np
import os
import matplotlib.pyplot as plt

def test_model(model_path):
    print(f"\nTestare model: {model_path}")
    print("="*60)
    
    try:
        model = tf.keras.models.load_model(model_path)
        print("✓ Model incarcat cu succes!")
        
        print(f"Input shape: {model.input_shape}")
        print(f"Output shape: {model.output_shape}")
        print(f"Total parametri: {model.count_params():,}")
        
        if model.input_shape[1:] == (224, 224, 3):
            test_input = np.random.rand(1, 224, 224, 3)
        elif model.input_shape[1:] == (299, 299, 3):
            test_input = np.random.rand(1, 299, 299, 3)
        else:
            print(f"Input shape neobisnuit: {model.input_shape}")
            return
        
        prediction = model.predict(test_input, verbose=0)
        print(f"\nTest prediction pe date random:")
        print(f"Output: {prediction[0][0]:.6f}")
        
        multiple_inputs = np.random.rand(10, *model.input_shape[1:])
        predictions = model.predict(multiple_inputs, verbose=0)
        
        print(f"\nStatistici pentru 10 predictii random:")
        print(f"Min: {predictions.min():.6f}")
        print(f"Max: {predictions.max():.6f}")
        print(f"Mean: {predictions.mean():.6f}")
        print(f"Std: {predictions.std():.6f}")
        
        if predictions.std() < 0.001:
            print("\n⚠️ ATENTIE: Modelul produce aceeasi valoare pentru toate inputurile!")
            print("Acest lucru indica ca modelul nu a fost antrenat corect.")
        
        return model
        
    except Exception as e:
        print(f"✗ Eroare la incarcarea modelului: {e}")
        return None

def test_on_real_data(model, data_dir):
    print("\n" + "="*60)
    print("TEST PE DATE REALE")
    print("="*60)
    
    input_size = model.input_shape[1]
    
    datagen = tf.keras.preprocessing.image.ImageDataGenerator(rescale=1./255)
    
    test_gen = datagen.flow_from_directory(
        data_dir,
        target_size=(input_size, input_size),
        batch_size=32,
        class_mode='binary',
        shuffle=False,
        classes=['fake', 'real']
    )
    
    if test_gen.samples == 0:
        print("Nu s-au gasit imagini!")
        return
    
    print(f"Imagini gasite: {test_gen.samples}")
    print(f"Class mapping: {test_gen.class_indices}")
    
    predictions = model.predict(test_gen, verbose=1)
    y_true = test_gen.classes
    
    print(f"\nDistributia predictiilor:")
    print(f"Predictii < 0.1: {np.sum(predictions < 0.1)}")
    print(f"Predictii 0.1-0.5: {np.sum((predictions >= 0.1) & (predictions < 0.5))}")
    print(f"Predictii 0.5-0.9: {np.sum((predictions >= 0.5) & (predictions < 0.9))}")
    print(f"Predictii > 0.9: {np.sum(predictions > 0.9)}")
    
    y_pred = (predictions > 0.5).astype(int).flatten()
    accuracy = np.mean(y_pred == y_true)
    
    print(f"\nAccuracy cu threshold 0.5: {accuracy:.4f}")
    
    fake_preds = predictions[y_true == 0]
    real_preds = predictions[y_true == 1]
    
    print(f"\nPredictii pentru imagini FAKE:")
    print(f"  Mean: {fake_preds.mean():.4f}")
    print(f"  Std: {fake_preds.std():.4f}")
    
    print(f"\nPredictii pentru imagini REAL:")
    print(f"  Mean: {real_preds.mean():.4f}")
    print(f"  Std: {real_preds.std():.4f}")
    
    plt.figure(figsize=(10, 4))
    
    plt.subplot(1, 2, 1)
    plt.hist(predictions, bins=50, edgecolor='black')
    plt.title('Distributia tuturor predictiilor')
    plt.xlabel('Probabilitate')
    plt.ylabel('Frecventa')
    
    plt.subplot(1, 2, 2)
    if len(fake_preds) > 0:
        plt.hist(fake_preds, bins=30, alpha=0.5, label='Fake', color='red')
    if len(real_preds) > 0:
        plt.hist(real_preds, bins=30, alpha=0.5, label='Real', color='green')
    plt.title('Distributia pe clase')
    plt.xlabel('Probabilitate')
    plt.ylabel('Frecventa')
    plt.legend()
    
    plt.tight_layout()
    plt.savefig('model_predictions_distribution.png')
    plt.close()
    
    print("\n✓ Grafic salvat: model_predictions_distribution.png")

def main():
    print("DIAGNOSTICARE RAPIDA MODELE DEEPFAKE")
    print("="*60)
    
    model_paths = [
        "savedModel/advanced_deepfake_model.keras",
        "savedModel/model_xception.keras"
    ]
    
    data_dir = "dataSet"
    
    if not os.path.exists(data_dir):
        print(f"EROARE: Nu exista directorul {data_dir}")
        return
    
    for model_path in model_paths:
        if os.path.exists(model_path):
            print(f"\n✓ Gasit: {model_path}")
            file_size = os.path.getsize(model_path) / (1024 * 1024)
            print(f"  Dimensiune: {file_size:.2f} MB")
            
            model = test_model(model_path)
            
            if model is not None:
                test_on_real_data(model, data_dir)
                
                print("\n" + "="*60)
                print("REZUMAT:")
                if model.input_shape[1] == 224:
                    print("- Model standard (224x224)")
                elif model.input_shape[1] == 299:
                    print("- Model Xception (299x299)")
                
                last_activation = model.layers[-1].activation
                print(f"- Ultima activare: {last_activation}")
                
                if hasattr(model.layers[-1], 'units'):
                    print(f"- Output units: {model.layers[-1].units}")
                
                break
        else:
            print(f"\n✗ Nu exista: {model_path}")
    
    print("\n" + "="*60)
    print("RECOMANDARI:")
    print("1. Daca modelul produce valori constante, re-antreneaza-l")
    print("2. Verifica ca ai clase balansate in dataset")
    print("3. Foloseste scriptul optimized_deepfake_trainer.py pentru rezultate mai bune")

if __name__ == "__main__":
    main()