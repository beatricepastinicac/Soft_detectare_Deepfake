import tensorflow as tf
import os
import numpy as np
import matplotlib.pyplot as plt
from sklearn.metrics import confusion_matrix, classification_report, roc_curve, auc
import seaborn as sns
import json
from datetime import datetime
import cv2
import pandas as pd

gpus = tf.config.experimental.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
        print(f"GPU disponibil: {len(gpus)} device(s)")
    except:
        pass

def create_lightweight_model(input_shape=(224, 224, 3)):
    base_model = tf.keras.applications.MobileNetV2(
        input_shape=input_shape,
        include_top=False,
        weights='imagenet'
    )
    
    base_model.trainable = False
    
    inputs = tf.keras.Input(shape=input_shape)
    x = tf.keras.applications.mobilenet_v2.preprocess_input(inputs)
    x = base_model(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    
    x = tf.keras.layers.Dense(256, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(0.01))(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Dropout(0.6)(x)
    
    x = tf.keras.layers.Dense(128, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(0.01))(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Dropout(0.5)(x)
    
    x = tf.keras.layers.Dense(64, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(0.01))(x)
    x = tf.keras.layers.Dropout(0.4)(x)
    
    outputs = tf.keras.layers.Dense(1, activation='sigmoid')(x)
    
    model = tf.keras.Model(inputs, outputs)
    
    return model, base_model

def create_aggressive_augmentation():
    train_datagen = tf.keras.preprocessing.image.ImageDataGenerator(
        rescale=1./255,
        validation_split=0.2,
        horizontal_flip=True,
        vertical_flip=False,
        rotation_range=20,
        zoom_range=0.2,
        width_shift_range=0.2,
        height_shift_range=0.2,
        brightness_range=[0.7, 1.3],
        shear_range=0.2,
        channel_shift_range=20,
        fill_mode='reflect'
    )
    
    val_datagen = tf.keras.preprocessing.image.ImageDataGenerator(
        rescale=1./255,
        validation_split=0.2
    )
    
    return train_datagen, val_datagen

def add_noise_augmentation(image):
    noise_factor = 0.05
    noise = np.random.normal(loc=0.0, scale=noise_factor, size=image.shape)
    image = np.clip(image + noise, 0., 1.)
    return image

def add_jpeg_compression(image):
    quality = np.random.randint(70, 95)
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    _, encimg = cv2.imencode('.jpg', image * 255, encode_param)
    decimg = cv2.imdecode(encimg, 1)
    return decimg / 255.0

class CustomAugmentationGenerator(tf.keras.utils.Sequence):
    def __init__(self, generator, apply_extra_augmentation=True):
        self.generator = generator
        self.apply_extra_augmentation = apply_extra_augmentation
        
    def __len__(self):
        return len(self.generator)
    
    def __getitem__(self, index):
        batch_x, batch_y = self.generator[index]
        
        if self.apply_extra_augmentation:
            for i in range(batch_x.shape[0]):
                if np.random.random() > 0.5:
                    batch_x[i] = add_noise_augmentation(batch_x[i])
                if np.random.random() > 0.5:
                    batch_x[i] = add_jpeg_compression(batch_x[i])
        
        return batch_x, batch_y

def prepare_multiple_datasets(primary_dir, kaggle_dir=None, batch_size=32):
    train_datagen, val_datagen = create_aggressive_augmentation()
    
    train_gens = []
    val_gens = []
    
    train_gen1 = train_datagen.flow_from_directory(
        primary_dir,
        target_size=(224, 224),
        batch_size=batch_size//2 if kaggle_dir else batch_size,
        class_mode='binary',
        subset='training',
        seed=42,
        classes=['fake', 'real']
    )
    train_gens.append(train_gen1)
    
    val_gen1 = val_datagen.flow_from_directory(
        primary_dir,
        target_size=(224, 224),
        batch_size=batch_size,
        class_mode='binary',
        subset='validation',
        seed=42,
        classes=['fake', 'real']
    )
    val_gens.append(val_gen1)
    
    if kaggle_dir and os.path.exists(kaggle_dir):
        train_gen2 = train_datagen.flow_from_directory(
            kaggle_dir,
            target_size=(224, 224),
            batch_size=batch_size//2,
            class_mode='binary',
            subset='training',
            seed=42,
            classes=['fake', 'real']
        )
        train_gens.append(train_gen2)
        
        print(f"Dataset 1: {train_gen1.samples} training samples")
        print(f"Dataset 2: {train_gen2.samples} training samples")
    
    custom_train_gen = CustomAugmentationGenerator(train_gens[0], apply_extra_augmentation=True)
    custom_val_gen = CustomAugmentationGenerator(val_gens[0], apply_extra_augmentation=False)
    
    return custom_train_gen, custom_val_gen, train_gens[0].samples, val_gens[0].samples, val_gens[0]

def create_callbacks(patience=2):
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor='val_auc',
            patience=patience,
            restore_best_weights=True,
            mode='max',
            verbose=1
        ),
        
        tf.keras.callbacks.ModelCheckpoint(
            'robust_model_best.h5',
            monitor='val_auc',
            save_best_only=True,
            mode='max',
            verbose=1
        ),
        
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=2,
            min_lr=1e-7,
            verbose=1
        ),
        
        tf.keras.callbacks.LearningRateScheduler(
            lambda epoch: 1e-3 * (0.5 ** (epoch // 4)),
            verbose=0
        ),
        
        tf.keras.callbacks.CSVLogger('training_log.csv')
    ]
    
    return callbacks

class ValidationMonitor(tf.keras.callbacks.Callback):
    def __init__(self, patience=2):
        super().__init__()
        self.patience = patience
        self.wait = 0
        self.best_val_auc = 0
        
    def on_epoch_end(self, epoch, logs=None):
        current_val_auc = logs.get('val_auc', 0)
        
        if current_val_auc > self.best_val_auc:
            self.best_val_auc = current_val_auc
            self.wait = 0
        else:
            self.wait += 1
            
        if self.wait >= self.patience and epoch > 5:
            print(f"\nStopping: Val AUC not improving for {self.patience} epochs")
            self.model.stop_training = True

def generate_advanced_visualizations(history, predictions, labels, threshold, val_generator):
    plt.style.use('seaborn-v0_8-darkgrid')
    
    fig = plt.figure(figsize=(20, 16))
    
    gs = fig.add_gridspec(4, 3, height_ratios=[1, 1, 1, 1], hspace=0.3, wspace=0.3)
    
    ax1 = fig.add_subplot(gs[0, :])
    epochs = range(1, len(history['accuracy']) + 1)
    ax1.plot(epochs, history['accuracy'], 'b-', label='accuracy', linewidth=2)
    ax1.plot(epochs, history['val_accuracy'], 'r-', label='val_accuracy', linewidth=2)
    ax1.set_title('Accuracy Evolution', fontsize=16, fontweight='bold')
    ax1.set_xlabel('Epoch', fontsize=12)
    ax1.set_ylabel('Accuracy', fontsize=12)
    ax1.legend(fontsize=12)
    ax1.grid(True, alpha=0.3)
    ax1.set_ylim([0, 1.05])
    
    ax2 = fig.add_subplot(gs[1, 0])
    ax2.plot(epochs, history['loss'], 'b-', label='Train', linewidth=2)
    ax2.plot(epochs, history['val_loss'], 'r-', label='Validation', linewidth=2)
    ax2.set_title('Loss Evolution', fontsize=14, fontweight='bold')
    ax2.set_xlabel('Epoch', fontsize=12)
    ax2.set_ylabel('Loss', fontsize=12)
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    ax3 = fig.add_subplot(gs[1, 1])
    if 'precision' in history:
        ax3.plot(epochs, history['precision'], 'g-', label='Train Precision', linewidth=2)
        ax3.plot(epochs, history['val_precision'], 'g--', label='Val Precision', linewidth=2)
        ax3.plot(epochs, history['recall'], 'b-', label='Train Recall', linewidth=2)
        ax3.plot(epochs, history['val_recall'], 'b--', label='Val Recall', linewidth=2)
    ax3.set_title('Precision & Recall', fontsize=14, fontweight='bold')
    ax3.set_xlabel('Epoch', fontsize=12)
    ax3.set_ylabel('Score', fontsize=12)
    ax3.legend()
    ax3.grid(True, alpha=0.3)
    
    ax4 = fig.add_subplot(gs[1, 2])
    if 'lr' in history:
        ax4.plot(epochs, history['lr'], 'orange', linewidth=2)
    ax4.set_title('Learning Rate Schedule', fontsize=14, fontweight='bold')
    ax4.set_xlabel('Epoch', fontsize=12)
    ax4.set_ylabel('Learning Rate', fontsize=12)
    ax4.set_yscale('log')
    ax4.grid(True, alpha=0.3)
    
    ax5 = fig.add_subplot(gs[2, 0])
    counts, bins, _ = ax5.hist(predictions.flatten(), bins=50, color='skyblue', edgecolor='black', alpha=0.7)
    ax5.axvline(x=threshold, color='red', linestyle='--', linewidth=2, label=f'Threshold={threshold:.2f}')
    ax5.set_title('Distributia tuturor predictiilor', fontsize=14, fontweight='bold')
    ax5.set_xlabel('Probabilitate', fontsize=12)
    ax5.set_ylabel('Frecventa', fontsize=12)
    ax5.legend()
    ax5.grid(True, alpha=0.3)
    
    ax6 = fig.add_subplot(gs[2, 1])
    fake_preds = predictions[labels == 0]
    real_preds = predictions[labels == 1]
    ax6.hist(fake_preds, bins=50, alpha=0.6, label='Fake', color='red', density=True)
    ax6.hist(real_preds, bins=50, alpha=0.6, label='Real', color='green', density=True)
    ax6.axvline(x=threshold, color='black', linestyle='--', linewidth=2)
    ax6.set_title('Distributia pe clase', fontsize=14, fontweight='bold')
    ax6.set_xlabel('Probabilitate', fontsize=12)
    ax6.set_ylabel('Frecventa', fontsize=12)
    ax6.legend()
    ax6.grid(True, alpha=0.3)
    
    ax7 = fig.add_subplot(gs[2, 2])
    y_pred = (predictions > threshold).astype(int).flatten()
    cm = confusion_matrix(labels, y_pred)
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax7,
                xticklabels=['Fake', 'Real'], yticklabels=['Fake', 'Real'],
                annot_kws={"size": 14})
    ax7.set_title('Confusion Matrix', fontsize=14, fontweight='bold')
    ax7.set_xlabel('Predicted', fontsize=12)
    ax7.set_ylabel('Actual', fontsize=12)
    
    ax8 = fig.add_subplot(gs[3, 0])
    fpr, tpr, _ = roc_curve(labels, predictions)
    roc_auc = auc(fpr, tpr)
    ax8.plot(fpr, tpr, 'b-', linewidth=2, label=f'ROC curve (AUC = {roc_auc:.3f})')
    ax8.plot([0, 1], [0, 1], 'k--', linewidth=1)
    ax8.set_title('ROC Curve', fontsize=14, fontweight='bold')
    ax8.set_xlabel('False Positive Rate', fontsize=12)
    ax8.set_ylabel('True Positive Rate', fontsize=12)
    ax8.legend()
    ax8.grid(True, alpha=0.3)
    
    ax9 = fig.add_subplot(gs[3, 1])
    thresholds = np.arange(0.0, 1.01, 0.05)
    f1_scores = []
    accuracies = []
    
    for t in thresholds:
        y_pred_t = (predictions > t).astype(int).flatten()
        tp = np.sum((y_pred_t == 1) & (labels == 1))
        fp = np.sum((y_pred_t == 1) & (labels == 0))
        fn = np.sum((y_pred_t == 0) & (labels == 1))
        tn = np.sum((y_pred_t == 0) & (labels == 0))
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        accuracy = (tp + tn) / len(labels)
        
        f1_scores.append(f1)
        accuracies.append(accuracy)
    
    ax9.plot(thresholds, f1_scores, 'g-', label='F1 Score', linewidth=2)
    ax9.plot(thresholds, accuracies, 'b-', label='Accuracy', linewidth=2)
    ax9.axvline(x=threshold, color='red', linestyle='--', linewidth=2)
    ax9.set_title('Metrics vs Threshold', fontsize=14, fontweight='bold')
    ax9.set_xlabel('Threshold', fontsize=12)
    ax9.set_ylabel('Score', fontsize=12)
    ax9.legend()
    ax9.grid(True, alpha=0.3)
    
    ax10 = fig.add_subplot(gs[3, 2])
    if val_generator:
        sample_images = []
        sample_labels = []
        sample_preds = []
        
        for i in range(min(3, len(val_generator))):
            batch_x, batch_y = val_generator[i]
            for j in range(min(4, len(batch_x))):
                sample_images.append(batch_x[j])
                sample_labels.append(batch_y[j])
                pred = predictions[i * val_generator.batch_size + j] if i * val_generator.batch_size + j < len(predictions) else 0.5
                sample_preds.append(pred)
        
        grid_size = int(np.sqrt(len(sample_images)))
        for i in range(min(grid_size * grid_size, len(sample_images))):
            ax_img = plt.subplot(gs[3, 2])
            if i == 0:
                ax_img.text(0.5, 0.5, f'Sample Predictions\n{grid_size}x{grid_size} grid', 
                           ha='center', va='center', fontsize=14, fontweight='bold')
                ax_img.axis('off')
    
    plt.suptitle('Advanced Deepfake Detection Model Analysis', fontsize=20, fontweight='bold')
    plt.tight_layout()
    plt.savefig('advanced_training_analysis.png', dpi=300, bbox_inches='tight')
    plt.close()
    
    df = pd.DataFrame(history)
    df.to_csv('training_history.csv', index=False)
    
    fig2, ax = plt.subplots(figsize=(10, 6))
    df[['accuracy', 'val_accuracy']].plot(ax=ax, linewidth=2.5)
    ax.set_title('Training Progress - Accuracy', fontsize=16, fontweight='bold')
    ax.set_xlabel('Epoch', fontsize=14)
    ax.set_ylabel('Accuracy', fontsize=14)
    ax.legend(['Training', 'Validation'], fontsize=12)
    ax.grid(True, alpha=0.3)
    plt.savefig('training_history.png', dpi=300, bbox_inches='tight')
    plt.close()

def train_robust_model(primary_dir, kaggle_dir=None, epochs=30, batch_size=32):
    print("="*60)
    print("ROBUST ANTI-OVERFITTING DEEPFAKE MODEL")
    print("="*60)
    
    print("\n1. Preparing datasets...")
    train_gen, val_gen, train_samples, val_samples, raw_val_gen = prepare_multiple_datasets(
        primary_dir, kaggle_dir, batch_size
    )
    
    print(f"\nTotal training samples: {train_samples}")
    print(f"Total validation samples: {val_samples}")
    
    print("\n2. Creating lightweight model...")
    model, base_model = create_lightweight_model()
    print(f"Total parameters: {model.count_params():,}")
    
    print("\n3. Compiling with conservative settings...")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
        loss='binary_crossentropy',
        metrics=['accuracy', tf.keras.metrics.AUC(name='auc'),
                 tf.keras.metrics.Precision(name='precision'),
                 tf.keras.metrics.Recall(name='recall')]
    )
    
    callbacks = create_callbacks(patience=2)
    callbacks.append(ValidationMonitor(patience=2))
    
    print("\n4. Phase 1: Transfer Learning...")
    history1 = model.fit(
        train_gen,
        steps_per_epoch=train_samples // batch_size,
        epochs=min(10, epochs),
        validation_data=val_gen,
        validation_steps=val_samples // batch_size,
        callbacks=callbacks,
        verbose=1
    )
    
    if max(history1.history['val_auc']) < 0.65:
        print("\nModel struggling. Stopping training.")
        return None, None
    
    if max(history1.history['val_auc']) > 0.75:
        print("\n5. Phase 2: Controlled Fine-tuning...")
        
        base_model.trainable = True
        for layer in base_model.layers[:-30]:
            layer.trainable = False
        
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5),
            loss='binary_crossentropy',
            metrics=['accuracy', tf.keras.metrics.AUC(name='auc'),
                     tf.keras.metrics.Precision(name='precision'),
                     tf.keras.metrics.Recall(name='recall')]
        )
        
        history2 = model.fit(
            train_gen,
            steps_per_epoch=train_samples // batch_size,
            epochs=epochs - 10,
            initial_epoch=10,
            validation_data=val_gen,
            validation_steps=val_samples // batch_size,
            callbacks=callbacks,
            verbose=1
        )
        
        history = {}
        for key in history1.history.keys():
            history[key] = history1.history[key] + history2.history.get(key, [])
    else:
        history = history1.history
    
    print("\n6. Final evaluation...")
    
    val_data = []
    val_labels = []
    for i in range(len(val_gen)):
        batch_x, batch_y = val_gen[i]
        val_data.append(batch_x)
        val_labels.append(batch_y)
    
    val_data = np.vstack(val_data[:val_samples//batch_size])
    val_labels = np.hstack(val_labels[:val_samples//batch_size])
    
    predictions = model.predict(val_data, batch_size=batch_size)
    
    best_threshold = 0.5
    best_f1 = 0
    
    for threshold in np.arange(0.3, 0.8, 0.05):
        y_pred = (predictions > threshold).astype(int).flatten()
        
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
    
    y_pred_final = (predictions > best_threshold).astype(int).flatten()
    
    print(f"\nOptimal threshold: {best_threshold:.2f}")
    print(f"Best F1 score: {best_f1:.4f}")
    
    print("\nClassification Report:")
    print(classification_report(val_labels, y_pred_final, target_names=['Fake', 'Real']))
    
    model.save('robust_deepfake_model.h5')
    
    config = {
        'model_type': 'MobileNetV2_Robust',
        'input_shape': [224, 224, 3],
        'best_threshold': float(best_threshold),
        'best_f1': float(best_f1),
        'training_samples': train_samples,
        'validation_samples': val_samples,
        'timestamp': datetime.now().isoformat()
    }
    
    with open('robust_model_config.json', 'w') as f:
        json.dump(config, f, indent=2)
    
    generate_advanced_visualizations(history, predictions, val_labels, best_threshold, raw_val_gen)
    
    return model, best_threshold

def main():
    primary_dir = "dataSet"
    kaggle_dir = "kaggle_dataset"
    
    if not os.path.exists(primary_dir):
        print("Primary dataset not found!")
        return
    
    if os.path.exists(kaggle_dir):
        print(f"Found Kaggle dataset at: {kaggle_dir}")
    else:
        print("Kaggle dataset not found. Training with primary dataset only.")
        kaggle_dir = None
    
    model, threshold = train_robust_model(
        primary_dir=primary_dir,
        kaggle_dir=kaggle_dir,
        epochs=30,
        batch_size=32
    )
    
    if model:
        print("\n" + "="*60)
        print("TRAINING COMPLETED")
        print("="*60)
        print(f"Model saved: robust_deepfake_model.h5")
        print(f"Config saved: robust_model_config.json")
        print(f"Analysis saved: advanced_training_analysis.png")
        print(f"History saved: training_history.png")
        print(f"Optimal threshold: {threshold:.2f}")

if __name__ == "__main__":
    main()