import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator # type: ignore
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau # type: ignore 
from tensorflow.keras.applications import Xception # type: ignore
from tensorflow.keras import layers, models # type: ignore
import os
import numpy as np
import cv2
import matplotlib.pyplot as plt

def extract_frames_from_video(video_path, output_folder, num_frames=10):
    """Extrage cadre dintr-un videoclip și le salvează într-un folder."""
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"⚠️ Nu s-a putut deschide videoclipul: {video_path}")
        return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_indices = np.linspace(0, total_frames - 1, num_frames, dtype=int)  

    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            frame = cv2.resize(frame, (224, 224))
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            filename = f"{os.path.basename(video_path).split('.')[0]}_frame_{idx}.jpg"
            output_path = os.path.join(output_folder, filename)
            cv2.imwrite(output_path, frame)

    cap.release()

def prepare_dataset(data_dir):
    """Pregătește dataset-ul: verifică imaginile și extrage cadre din videoclipuri."""
    valid_video_extensions = ('.mp4', '.avi', '.mov', '.mkv')

    for label in ['real', 'fake']:
        video_dir = os.path.join(data_dir, label, 'videos')
        image_output_dir = os.path.join(data_dir, label, 'images')

        os.makedirs(image_output_dir, exist_ok=True)  

        if os.path.exists(video_dir):
            for subdir, _, files in os.walk(video_dir):
                for file in files:
                    if file.lower().endswith(valid_video_extensions):
                        video_path = os.path.join(subdir, file)
                        extract_frames_from_video(video_path, image_output_dir)

def create_model():
    base_model = Xception(weights="imagenet", include_top=False, input_shape=(224, 224, 3))
    base_model.trainable = False  

    model = models.Sequential([
        base_model,
        layers.GlobalAveragePooling2D(),
        layers.Dense(256, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.5),
        layers.Dense(1, activation='sigmoid')
    ])

    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001), 
                  loss='binary_crossentropy', 
                  metrics=['accuracy'])
    
    return model

def train_model(data_dir, model_save_path, batch_size=32):
    prepare_dataset(data_dir)  

    datagen = ImageDataGenerator(
        rotation_range=20,
        width_shift_range=0.2,
        height_shift_range=0.2,
        shear_range=0.2,
        zoom_range=0.2,
        horizontal_flip=True,
        brightness_range=[0.8, 1.2],  
        preprocessing_function=tf.keras.applications.xception.preprocess_input,
        validation_split=0.2 
    )

    train_generator = datagen.flow_from_directory(
        directory=data_dir,
        target_size=(224, 224),
        batch_size=batch_size,
        class_mode='binary',
        subset='training' 
    )

    val_generator = datagen.flow_from_directory(
        directory=data_dir,
        target_size=(224, 224),
        batch_size=batch_size,
        class_mode='binary',
        subset='validation'  
    )

    model = create_model()

    checkpoint = ModelCheckpoint(model_save_path, monitor='val_loss', save_best_only=True, mode='min')
    early_stopping = EarlyStopping(monitor='val_loss', patience=10, mode='min')
    reduce_lr = ReduceLROnPlateau(monitor='val_loss', factor=0.2, patience=5, mode='min', min_lr=1e-6)

    history = model.fit(train_generator,
                        epochs=30,
                        validation_data=val_generator,
                        callbacks=[checkpoint, early_stopping, reduce_lr])

    plt.plot(history.history['accuracy'], label='accuracy')
    plt.plot(history.history['val_accuracy'], label='val_accuracy')
    plt.xlabel('Epoch')
    plt.ylabel('Accuracy')
    plt.ylim([0, 1])
    plt.legend(loc='lower right')
    plt.savefig('training_history.png')

    print(f"Modelul a fost salvat la {model_save_path}")

if __name__ == "__main__":
    data_dir = 'backend/deepfakeDetector/dataSet'  
    model_save_path = 'backend/deepfakeDetector/savedModel/model_xception.keras'
    train_model(data_dir, model_save_path, batch_size=32)
