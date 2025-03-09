import tensorflow as tf
import os
import numpy as np
import cv2
import matplotlib.pyplot as plt
import shutil
import glob

ImageDataGenerator = tf.keras.preprocessing.image.ImageDataGenerator
ModelCheckpoint = tf.keras.callbacks.ModelCheckpoint
EarlyStopping = tf.keras.callbacks.EarlyStopping
ReduceLROnPlateau = tf.keras.callbacks.ReduceLROnPlateau
Xception = tf.keras.applications.Xception
layers = tf.keras.layers
models = tf.keras.models

def extract_frames_from_video(video_path, output_folder, num_frames=10):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Nu s-a putut deschide videoclipul: {video_path}")
        return 0

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_indices = np.linspace(0, total_frames - 1, num_frames, dtype=int)
    frames_extracted = 0
    
    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            frame = cv2.resize(frame, (224, 224))
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            filename = f"{os.path.basename(video_path).split('.')[0]}_frame_{idx}.jpg"
            output_path = os.path.join(output_folder, filename)
            cv2.imwrite(output_path, frame)
            frames_extracted += 1
    
    cap.release()
    print(f"  Extrase {frames_extracted} cadre din {video_path}")
    return frames_extracted

def prepare_dataset(data_dir):
    processed_dir = os.path.join(data_dir, "processed")
    os.makedirs(processed_dir, exist_ok=True)
    
    for label in ['real', 'fake']:
        label_dir = os.path.join(processed_dir, label)
        if os.path.exists(label_dir):
            print(f"Curățăm directorul: {label_dir}")
            shutil.rmtree(label_dir)
        os.makedirs(label_dir, exist_ok=True)
    
    total_images = {'real': 0, 'fake': 0}
    
    label = 'real'
    print(f"\nProcesăm clasa: {label}")
    
    real_images_dir = os.path.join(data_dir, 'real', 'images')
    real_videos_dir = os.path.join(data_dir, 'real', 'videos')
    
    print(f"Structura directorului pentru {label}:")
    if os.path.exists(real_images_dir):
        print(f"  Directorul de imagini {real_images_dir} există")
        print(f"  Conținut: {os.listdir(real_images_dir)}")
    else:
        print(f"  Directorul de imagini {real_images_dir} nu există")
    
    if os.path.exists(real_videos_dir):
        print(f"  Directorul de videoclipuri {real_videos_dir} există")
        print(f"  Conținut: {os.listdir(real_videos_dir)}")
    else:
        print(f"  Directorul de videoclipuri {real_videos_dir} nu există")
    
    if os.path.exists(real_images_dir):
        image_count = 0
        lfw_dir = os.path.join(real_images_dir, 'setDate_lfwDeepfunneled')
        if os.path.exists(lfw_dir):
            print(f"Căutăm imagini în: {lfw_dir}")
            for root, dirs, files in os.walk(lfw_dir):
                for file in files:
                    if file.lower().endswith(('.jpg', '.jpeg', '.png')):
                        src_path = os.path.join(root, file)
                        base_name = os.path.splitext(file)[0]
                        ext = os.path.splitext(file)[1]
                        folder_name = os.path.basename(root)
                        dst_filename = f"{folder_name}_{base_name}{ext}"
                        dst_path = os.path.join(processed_dir, label, dst_filename)
                        
                        try:
                            shutil.copy2(src_path, dst_path)
                            image_count += 1
                            if image_count % 500 == 0:
                                print(f"  Copiate {image_count} imagini...")
                        except Exception as e:
                            print(f"  Eroare la copierea {src_path}: {e}")
        else:
            print(f"Căutăm imagini direct în: {real_images_dir}")
            for root, dirs, files in os.walk(real_images_dir):
                for file in files:
                    if file.lower().endswith(('.jpg', '.jpeg', '.png')):
                        src_path = os.path.join(root, file)
                        base_name = os.path.splitext(file)[0]
                        ext = os.path.splitext(file)[1]
                        folder_name = os.path.basename(root)
                        dst_filename = f"{folder_name}_{base_name}{ext}"
                        dst_path = os.path.join(processed_dir, label, dst_filename)
                        
                        try:
                            shutil.copy2(src_path, dst_path)
                            image_count += 1
                            if image_count % 500 == 0:
                                print(f"  Copiate {image_count} imagini...")
                        except Exception as e:
                            print(f"  Eroare la copierea {src_path}: {e}")
        
        print(f"  Total {image_count} imagini copiate pentru {label}")
        total_images[label] += image_count
    
    if os.path.exists(real_videos_dir):
        video_frames = 0
        video_count = 0
        
        celeb_dir = os.path.join(real_videos_dir, 'Celeb-real')
        youtube_dir = os.path.join(real_videos_dir, 'YouTube-real')
        
        video_paths = []
        if os.path.exists(celeb_dir):
            for root, _, files in os.walk(celeb_dir):
                for file in files:
                    if file.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
                        video_paths.append(os.path.join(root, file))
        
        if os.path.exists(youtube_dir):
            for root, _, files in os.walk(youtube_dir):
                for file in files:
                    if file.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
                        video_paths.append(os.path.join(root, file))
        
        if not video_paths:
            for root, _, files in os.walk(real_videos_dir):
                for file in files:
                    if file.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
                        video_paths.append(os.path.join(root, file))
        
        for video_path in video_paths:
            video_count += 1
            frames = extract_frames_from_video(video_path, os.path.join(processed_dir, label))
            video_frames += frames
        
        print(f"  Total {video_count} videoclipuri procesate")
        print(f"  Total {video_frames} cadre extrase din videoclipuri pentru {label}")
        total_images[label] += video_frames
    
    label = 'fake'
    print(f"\nProcesăm clasa: {label}")
    
    fake_images_dir = os.path.join(data_dir, 'fake', 'images')
    fake_videos_dir = os.path.join(data_dir, 'fake', 'videos')
    
    print(f"Structura directorului pentru {label}:")
    if os.path.exists(fake_images_dir):
        print(f"  Directorul de imagini {fake_images_dir} există")
        print(f"  Conținut: {os.listdir(fake_images_dir)}")
    else:
        print(f"  Directorul de imagini {fake_images_dir} nu există")
    
    if os.path.exists(fake_videos_dir):
        print(f"  Directorul de videoclipuri {fake_videos_dir} există")
        print(f"  Conținut: {os.listdir(fake_videos_dir)}")
    else:
        print(f"  Directorul de videoclipuri {fake_videos_dir} nu există")
    
    if os.path.exists(fake_images_dir):
        image_count = 0
        cropped_dir = os.path.join(fake_images_dir, 'cropped_images')
        if os.path.exists(cropped_dir):
            print(f"Căutăm imagini în: {cropped_dir}")
            for root, dirs, files in os.walk(cropped_dir):
                for file in files:
                    if file.lower().endswith(('.jpg', '.jpeg', '.png')):
                        src_path = os.path.join(root, file)
                        base_name = os.path.splitext(file)[0]
                        ext = os.path.splitext(file)[1]
                        folder_name = os.path.basename(root)
                        dst_filename = f"{folder_name}_{base_name}{ext}"
                        dst_path = os.path.join(processed_dir, label, dst_filename)
                        
                        try:
                            shutil.copy2(src_path, dst_path)
                            image_count += 1
                            if image_count % 500 == 0:
                                print(f"  Copiate {image_count} imagini...")
                        except Exception as e:
                            print(f"  Eroare la copierea {src_path}: {e}")
        else:
            print(f"Căutăm imagini direct în: {fake_images_dir}")
            for root, dirs, files in os.walk(fake_images_dir):
                for file in files:
                    if file.lower().endswith(('.jpg', '.jpeg', '.png')):
                        src_path = os.path.join(root, file)
                        base_name = os.path.splitext(file)[0]
                        ext = os.path.splitext(file)[1]
                        folder_name = os.path.basename(root)
                        dst_filename = f"{folder_name}_{base_name}{ext}"
                        dst_path = os.path.join(processed_dir, label, dst_filename)
                        
                        try:
                            shutil.copy2(src_path, dst_path)
                            image_count += 1
                            if image_count % 500 == 0:
                                print(f"  Copiate {image_count} imagini...")
                        except Exception as e:
                            print(f"  Eroare la copierea {src_path}: {e}")
        
        print(f"  Total {image_count} imagini copiate pentru {label}")
        total_images[label] += image_count
    
    for label, count in total_images.items():
        print(f"\nTotal {count} imagini pentru clasa {label}")
        if count == 0:
            print(f"AVERTISMENT: Nu există imagini pentru clasa {label}!")
    
    return total_images

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
    total_images = prepare_dataset(data_dir)
    
    if total_images['real'] == 0 or total_images['fake'] == 0:
        print("\nEroare: Nu există suficiente imagini pentru ambele clase!")
        print("Verifică structura directoarelor și disponibilitatea fișierelor.")
        return
    
    processed_dir = os.path.join(data_dir, "processed")
    
    print("\nVerificăm numărul de imagini în directoarele procesate:")
    for label in ['real', 'fake']:
        label_dir = os.path.join(processed_dir, label)
        if os.path.exists(label_dir):
            image_count = len([f for f in os.listdir(label_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
            print(f"  {label}: {image_count} imagini")
    
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
    
    print("\nÎncărcăm datele de antrenare și validare:")
    train_generator = datagen.flow_from_directory(
        directory=processed_dir,
        target_size=(224, 224),
        batch_size=batch_size,
        class_mode='binary',
        subset='training',
        shuffle=True
    )
    
    val_generator = datagen.flow_from_directory(
        directory=processed_dir,
        target_size=(224, 224),
        batch_size=batch_size,
        class_mode='binary',
        subset='validation',
        shuffle=True
    )
    
    if train_generator.samples == 0 or val_generator.samples == 0:
        print("\nEroare: Nu s-au găsit imagini în directorul processat!")
        print(f"Verifică directorul: {processed_dir}")
        return
    
    model = create_model()
 
    os.makedirs(os.path.dirname(model_save_path), exist_ok=True)
    
    checkpoint = ModelCheckpoint(model_save_path, monitor='val_loss', save_best_only=True, mode='min')
    early_stopping = EarlyStopping(monitor='val_loss', patience=10, mode='min')
    reduce_lr = ReduceLROnPlateau(monitor='val_loss', factor=0.2, patience=5, mode='min', min_lr=1e-6)
    
    print("\nÎncepem antrenarea modelului...")
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
    print("Director curent:", os.getcwd())
 
    current_dir = os.getcwd()

    data_dir = "dataSet"
 
    if not os.path.exists(data_dir):
       
        if os.path.basename(current_dir) == 'deepfakeDetector':
            possible_dirs = [
                os.path.join("..", "dataSet"),
                os.path.join("dataSet"),
                os.path.join("backend", "dataSet")
            ]
        else:
            
            possible_dirs = [
                os.path.join("dataSet"),
                os.path.join("backend", "deepfakeDetector", "dataSet"),
                os.path.join("backend", "dataSet"),
                os.path.join("..", "dataSet")
            ]
      
        for dir_path in possible_dirs:
            if os.path.exists(dir_path):
                data_dir = dir_path
                break
    
    print(f"Folosim directorul de date: {data_dir}")
    
    model_dir = "savedModel"
    if not os.path.exists(model_dir):
        os.makedirs(model_dir, exist_ok=True)
    
    model_save_path = os.path.join(model_dir, "model_xception.keras")
    
    train_model(data_dir, model_save_path, batch_size=32)