import tensorflow as tf
import os
import numpy as np
import cv2
import matplotlib.pyplot as plt
import shutil
from datetime import datetime
from sklearn.metrics import confusion_matrix, classification_report
import seaborn as sns

gpus = tf.config.experimental.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
        print(f"GPU disponibil: {len(gpus)} device(s)")
    except RuntimeError as e:
        print(f"Eroare la configurarea GPU: {e}")

def create_ensemble_model(input_shape=(299, 299, 3)):
    """Creează un model ensemble cu multiple backbone-uri pentru acuratețe maximă"""
    
    inputs = tf.keras.Input(shape=input_shape)
    
    # Branch 1: Xception
    xception_base = tf.keras.applications.Xception(
        input_shape=input_shape,
        include_top=False,
        weights='imagenet'
    )
    xception_base.trainable = False
    x1 = tf.keras.applications.xception.preprocess_input(inputs)
    x1 = xception_base(x1, training=False)
    x1 = tf.keras.layers.GlobalAveragePooling2D()(x1)
    
    # Branch 2: EfficientNetB3
    efficientnet_base = tf.keras.applications.EfficientNetB3(
        input_shape=input_shape,
        include_top=False,
        weights='imagenet'
    )
    efficientnet_base.trainable = False
    x2 = tf.keras.applications.efficientnet.preprocess_input(inputs)
    x2 = efficientnet_base(x2, training=False)
    x2 = tf.keras.layers.GlobalAveragePooling2D()(x2)
    
    # Concatenate branches
    combined = tf.keras.layers.concatenate([x1, x2])
    
    # Deep feature extraction
    x = tf.keras.layers.Dense(1024, activation='relu')(combined)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Dropout(0.6)(x)
    
    x = tf.keras.layers.Dense(512, activation='relu')(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Dropout(0.5)(x)
    
    x = tf.keras.layers.Dense(256, activation='relu')(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Dropout(0.4)(x)
    
    x = tf.keras.layers.Dense(128, activation='relu')(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Dropout(0.3)(x)
    
    outputs = tf.keras.layers.Dense(1, activation='sigmoid')(x)
    
    model = tf.keras.Model(inputs, outputs)
    
    return model, [xception_base, efficientnet_base]

def create_advanced_generators(data_dir, batch_size=8, validation_split=0.2):
    """Generatori avansați cu augmentări specifice pentru deepfake detection"""
    
    train_datagen = tf.keras.preprocessing.image.ImageDataGenerator(
        rescale=1./255,
        validation_split=validation_split,
        horizontal_flip=True,
        vertical_flip=False,
        rotation_range=20,
        zoom_range=0.15,
        width_shift_range=0.15,
        height_shift_range=0.15,
        brightness_range=[0.8, 1.2],
        shear_range=0.15,
        channel_shift_range=0.2,
        fill_mode='reflect'
    )
    
    val_datagen = tf.keras.preprocessing.image.ImageDataGenerator(
        rescale=1./255,
        validation_split=validation_split
    )
    
    train_generator = train_datagen.flow_from_directory(
        data_dir,
        target_size=(299, 299),
        batch_size=batch_size,
        class_mode='binary',
        subset='training',
        shuffle=True,
        seed=42,
        classes=['fake', 'real'],
        interpolation='lanczos'
    )
    
    val_generator = val_datagen.flow_from_directory(
        data_dir,
        target_size=(299, 299),
        batch_size=batch_size,
        class_mode='binary',
        subset='validation',
        shuffle=False,
        seed=42,
        classes=['fake', 'real'],
        interpolation='lanczos'
    )
    
    return train_generator, val_generator

class DetailedMetricsCallback(tf.keras.callbacks.Callback):
    def __init__(self, validation_data, patience=3):
        super().__init__()
        self.validation_data = validation_data
        self.patience = patience
        self.wait = 0
        self.best_f1 = 0
        
    def on_epoch_end(self, epoch, logs=None):
        val_predictions = self.model.predict(self.validation_data, verbose=0)
        val_labels = self.validation_data.classes
        
        # Find optimal threshold
        best_threshold = 0.5
        best_f1 = 0
        
        for threshold in np.arange(0.3, 0.8, 0.05):
            y_pred = (val_predictions > threshold).astype(int).flatten()
            
            tp = np.sum((y_pred == 1) & (val_labels == 1))
            fp = np.sum((y_pred == 1) & (val_labels == 0))
            fn = np.sum((y_pred == 0) & (val_labels == 1))
            tn = np.sum((y_pred == 0) & (val_labels == 0))
            
            precision = tp / (tp + fp) if (tp + fp) > 0 else 0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0
            f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
            
            if f1 > best_f1:
                best_f1 = f1
                best_threshold = threshold
        
        # Calculate metrics with best threshold
        y_pred_best = (val_predictions > best_threshold).astype(int).flatten()
        accuracy = np.mean(y_pred_best == val_labels)
        
        print(f"\n[Epoch {epoch+1}] Best threshold: {best_threshold:.2f}")
        print(f"Accuracy: {accuracy:.4f}, F1: {best_f1:.4f}")
        
        # Early stopping based on F1
        if best_f1 > self.best_f1:
            self.best_f1 = best_f1
            self.wait = 0
        else:
            self.wait += 1
            if self.wait >= self.patience:
                print(f"\nEarly stopping triggered. Best F1: {self.best_f1:.4f}")
                self.model.stop_training = True

def train_high_accuracy_model(data_dir, model_save_path="high_accuracy_deepfake_model.keras", 
                              epochs=50, batch_size=8):
    print("="*60)
    print("ANTRENARE MODEL HIGH ACCURACY DEEPFAKE DETECTION")
    print("="*60)
    
    # 1. Prepare data
    print("\n1. Pregătirea datelor...")
    train_gen, val_gen = create_advanced_generators(data_dir, batch_size)
    
    print(f"   - Training samples: {train_gen.samples}")
    print(f"   - Validation samples: {val_gen.samples}")
    print(f"   - Class distribution: {np.bincount(train_gen.classes)}")
    
    # 2. Create model
    print("\n2. Crearea modelului ensemble...")
    model, base_models = create_ensemble_model()
    
    print(f"   - Total parametri: {model.count_params():,}")
    
    # 3. Calculate class weights
    total_samples = train_gen.samples
    class_counts = np.bincount(train_gen.classes)
    class_weight = {
        0: total_samples / (2.0 * class_counts[0]),
        1: total_samples / (2.0 * class_counts[1])
    }
    print(f"\n3. Class weights: {class_weight}")
    
    # 4. Compile with advanced optimizer
    print("\n4. Compilare model...")
    
    initial_lr = 0.001
    lr_schedule = tf.keras.optimizers.schedules.CosineDecayRestarts(
        initial_lr,
        first_decay_steps=1000,
        t_mul=2.0,
        m_mul=0.9,
        alpha=0.1
    )
    
    optimizer = tf.keras.optimizers.Adam(learning_rate=lr_schedule)
    
    model.compile(
        optimizer=optimizer,
        loss=tf.keras.losses.BinaryFocalCrossentropy(gamma=2.0, alpha=0.25),
        metrics=[
            'accuracy',
            tf.keras.metrics.Precision(name='precision'),
            tf.keras.metrics.Recall(name='recall'),
            tf.keras.metrics.AUC(name='auc')
        ]
    )
    
    # 5. Setup callbacks
    print("\n5. Configurare callbacks...")
    
    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(
            model_save_path,
            monitor='val_auc',
            save_best_only=True,
            mode='max',
            verbose=1
        ),
        
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=1e-8,
            verbose=1
        ),
        
        DetailedMetricsCallback(val_gen, patience=5),
        
        tf.keras.callbacks.TensorBoard(
            log_dir=f'logs/{datetime.now().strftime("%Y%m%d-%H%M%S")}',
            histogram_freq=1
        ),
        
        tf.keras.callbacks.CSVLogger('high_accuracy_training_log.csv')
    ]
    
    # 6. Initial training
    print("\n6. Antrenare inițială (transfer learning)...")
    
    history = model.fit(
        train_gen,
        epochs=20,
        validation_data=val_gen,
        callbacks=callbacks,
        class_weight=class_weight,
        verbose=1
    )
    
    # 7. Fine-tuning phase 1
    print("\n7. Fine-tuning faza 1...")
    
    # Unfreeze top layers of base models
    for base_model in base_models:
        base_model.trainable = True
        # Freeze bottom layers
        for layer in base_model.layers[:-50]:
            layer.trainable = False
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
        loss=tf.keras.losses.BinaryFocalCrossentropy(gamma=2.0, alpha=0.25),
        metrics=[
            'accuracy',
            tf.keras.metrics.Precision(name='precision'),
            tf.keras.metrics.Recall(name='recall'),
            tf.keras.metrics.AUC(name='auc')
        ]
    )
    
    history_fine1 = model.fit(
        train_gen,
        epochs=15,
        initial_epoch=20,
        validation_data=val_gen,
        callbacks=callbacks,
        class_weight=class_weight,
        verbose=1
    )
    
    # 8. Fine-tuning phase 2 (all layers)
    print("\n8. Fine-tuning faza 2 (toate layerele)...")
    
    # Unfreeze all layers
    for base_model in base_models:
        base_model.trainable = True
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.00001),
        loss=tf.keras.losses.BinaryFocalCrossentropy(gamma=2.0, alpha=0.25),
        metrics=[
            'accuracy',
            tf.keras.metrics.Precision(name='precision'),
            tf.keras.metrics.Recall(name='recall'),
            tf.keras.metrics.AUC(name='auc')
        ]
    )
    
    history_fine2 = model.fit(
        train_gen,
        epochs=epochs - 35,
        initial_epoch=35,
        validation_data=val_gen,
        callbacks=callbacks,
        class_weight=class_weight,
        verbose=1
    )
    
    # Combine histories
    for key in history.history.keys():
        history.history[key].extend(history_fine1.history[key])
        history.history[key].extend(history_fine2.history[key])
    
    # 9. Final evaluation
    print("\n9. Evaluare finală...")
    
    val_predictions = model.predict(val_gen, verbose=1)
    val_labels = val_gen.classes
    
    # Find optimal threshold
    best_threshold = 0.5
    best_f1 = 0
    best_accuracy = 0
    
    for threshold in np.arange(0.3, 0.8, 0.01):
        y_pred = (val_predictions > threshold).astype(int).flatten()
        
        tp = np.sum((y_pred == 1) & (val_labels == 1))
        fp = np.sum((y_pred == 1) & (val_labels == 0))
        fn = np.sum((y_pred == 0) & (val_labels == 1))
        tn = np.sum((y_pred == 0) & (val_labels == 0))
        
        accuracy = (tp + tn) / (tp + tn + fp + fn)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        
        if f1 > best_f1:
            best_f1 = f1
            best_threshold = threshold
            best_accuracy = accuracy
    
    print(f"\nPrag optimal: {best_threshold:.2f}")
    print(f"Acuratețe maximă: {best_accuracy:.4f}")
    print(f"F1 Score maxim: {best_f1:.4f}")
    
    # Generate classification report
    y_pred_optimal = (val_predictions > best_threshold).astype(int).flatten()
    print("\nRaport clasificare:")
    print(classification_report(val_labels, y_pred_optimal, 
                                target_names=['Fake', 'Real'], digits=4))
    
    # Save results
    plot_advanced_results(history, val_predictions, val_labels, best_threshold)
    
    # Save model config
    model_config = {
        'best_threshold': float(best_threshold),
        'best_accuracy': float(best_accuracy),
        'best_f1': float(best_f1),
        'class_indices': train_gen.class_indices,
        'input_shape': (299, 299, 3),
        'model_type': 'ensemble_xception_efficientnet'
    }
    
    import json
    with open('high_accuracy_model_config.json', 'w') as f:
        json.dump(model_config, f, indent=2)
    
    return model, history, best_threshold

def plot_advanced_results(history, predictions, labels, threshold):
    """Generează vizualizări detaliate ale rezultatelor"""
    
    # 1. Training history
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    
    # Loss
    axes[0, 0].plot(history.history['loss'], label='Train Loss', linewidth=2)
    axes[0, 0].plot(history.history['val_loss'], label='Val Loss', linewidth=2)
    axes[0, 0].set_title('Model Loss', fontsize=14)
    axes[0, 0].set_xlabel('Epoch')
    axes[0, 0].set_ylabel('Loss')
    axes[0, 0].legend()
    axes[0, 0].grid(True, alpha=0.3)
    
    # Accuracy
    axes[0, 1].plot(history.history['accuracy'], label='Train Accuracy', linewidth=2)
    axes[0, 1].plot(history.history['val_accuracy'], label='Val Accuracy', linewidth=2)
    axes[0, 1].set_title('Model Accuracy', fontsize=14)
    axes[0, 1].set_xlabel('Epoch')
    axes[0, 1].set_ylabel('Accuracy')
    axes[0, 1].legend()
    axes[0, 1].grid(True, alpha=0.3)
    
    # AUC
    axes[0, 2].plot(history.history['auc'], label='Train AUC', linewidth=2)
    axes[0, 2].plot(history.history['val_auc'], label='Val AUC', linewidth=2)
    axes[0, 2].set_title('Model AUC', fontsize=14)
    axes[0, 2].set_xlabel('Epoch')
    axes[0, 2].set_ylabel('AUC')
    axes[0, 2].legend()
    axes[0, 2].grid(True, alpha=0.3)
    
    # Precision & Recall
    axes[1, 0].plot(history.history['precision'], label='Train Precision', linewidth=2)
    axes[1, 0].plot(history.history['val_precision'], label='Val Precision', linewidth=2)
    axes[1, 0].plot(history.history['recall'], label='Train Recall', linewidth=2)
    axes[1, 0].plot(history.history['val_recall'], label='Val Recall', linewidth=2)
    axes[1, 0].set_title('Precision & Recall', fontsize=14)
    axes[1, 0].set_xlabel('Epoch')
    axes[1, 0].set_ylabel('Score')
    axes[1, 0].legend()
    axes[1, 0].grid(True, alpha=0.3)
    
    # Prediction distribution
    axes[1, 1].hist(predictions[labels == 0], bins=50, alpha=0.5, label='Fake', color='red', density=True)
    axes[1, 1].hist(predictions[labels == 1], bins=50, alpha=0.5, label='Real', color='green', density=True)
    axes[1, 1].axvline(x=threshold, color='black', linestyle='--', label=f'Threshold={threshold:.2f}')
    axes[1, 1].set_title('Prediction Distribution', fontsize=14)
    axes[1, 1].set_xlabel('Probability')
    axes[1, 1].set_ylabel('Density')
    axes[1, 1].legend()
    axes[1, 1].grid(True, alpha=0.3)
    
    # Confusion Matrix
    y_pred = (predictions > threshold).astype(int).flatten()
    cm = confusion_matrix(labels, y_pred)
    
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=axes[1, 2],
                xticklabels=['Fake', 'Real'], yticklabels=['Fake', 'Real'])
    axes[1, 2].set_title(f'Confusion Matrix (Threshold={threshold:.2f})', fontsize=14)
    axes[1, 2].set_ylabel('True Label')
    axes[1, 2].set_xlabel('Predicted Label')
    
    plt.tight_layout()
    plt.savefig('high_accuracy_training_results.png', dpi=300, bbox_inches='tight')
    plt.close()
    
    # 2. ROC Curve
    from sklearn.metrics import roc_curve, auc
    
    fpr, tpr, _ = roc_curve(labels, predictions)
    roc_auc = auc(fpr, tpr)
    
    plt.figure(figsize=(8, 6))
    plt.plot(fpr, tpr, linewidth=2, label=f'ROC curve (AUC = {roc_auc:.4f})')
    plt.plot([0, 1], [0, 1], 'k--', linewidth=1)
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel('False Positive Rate')
    plt.ylabel('True Positive Rate')
    plt.title('Receiver Operating Characteristic (ROC) Curve')
    plt.legend(loc="lower right")
    plt.grid(True, alpha=0.3)
    plt.savefig('roc_curve.png', dpi=300, bbox_inches='tight')
    plt.close()

def test_model_on_image(model, image_path, threshold=0.5):
    """Testează modelul pe o imagine individuală"""
    img = cv2.imread(image_path)
    img = cv2.resize(img, (299, 299))
    img = img / 255.0
    img = np.expand_dims(img, axis=0)
    
    prediction = model.predict(img, verbose=0)[0][0]
    
    if prediction > threshold:
        label = "Real"
        confidence = prediction
    else:
        label = "Fake"
        confidence = 1 - prediction
    
    return label, confidence, prediction

def main():
    # === Google Colab specific path ===
    data_dir = "/content/140k/real-vs-fake/train"
    
    if not os.path.exists(data_dir):
        print(f"EROARE: Directorul nu există: {data_dir}")
        return
    
    print(f"📁 Director date găsit: {data_dir}")
    
    if not os.path.exists(os.path.join(data_dir, 'fake')) or not os.path.exists(os.path.join(data_dir, 'real')):
        print("⚠️ EROARE: Directorul trebuie să conțină subfolderele 'fake' și 'real'")
        return

    model_dir = "/content/savedModel"
    os.makedirs(model_dir, exist_ok=True)
    model_save_path = os.path.join(model_dir, "high_accuracy_deepfake_model.keras")
    
    model, history, best_threshold = train_high_accuracy_model(
        data_dir=data_dir,
        model_save_path=model_save_path,
        epochs=50,
        batch_size=8
    )
    
    print("\n" + "="*60)
    print("✅ ANTRENARE FINALIZATĂ CU SUCCES!")
    print("="*60)
    print(f"🧠 Model salvat la: {model_save_path}")
    print(f"🎯 Prag optimal de decizie: {best_threshold:.2f}")
    print("\n📄 Fișiere generate:")
    print("- high_accuracy_training_results.png")
    print("- roc_curve.png")
    print("- high_accuracy_model_config.json")
    print("- high_accuracy_training_log.csv")
    print("- logs/ (pentru TensorBoard)")
    
    # Test pe câteva imagini
    print("\n" + "="*60)
    print("🔬 TEST RAPID PE CÂTEVA IMAGINI")
    print("="*60)
    
    test_images = []
    for class_name in ['fake', 'real']:
        class_dir = os.path.join(data_dir, class_name)
        if not os.path.exists(class_dir):
            continue
        images = [f for f in os.listdir(class_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))][:2]
        for img in images:
            test_images.append((os.path.join(class_dir, img), class_name))
    
    if test_images:
        for img_path, true_label in test_images:
            predicted_label, confidence, raw_score = test_model_on_image(model, img_path, best_threshold)
            print(f"\n🖼️ Imagine: {os.path.basename(img_path)}")
            print(f"  ✅ Adevărat: {true_label.upper()}")
            print(f"  🤖 Prezis: {predicted_label} (Încredere: {confidence:.2%})")
            print(f"  📊 Scor raw: {raw_score:.4f}")
    
    print("\n" + "="*60)
    print("📊 Pentru a vizualiza progresul antrenării, rulează în terminal:")
    print("👉 tensorboard --logdir=logs")
    print("="*60)

if __name__ == "__main__":
    main()