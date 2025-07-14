import os
import numpy as np
import tensorflow as tf
import cv2
import json
import time
import sys

try:
    import matplotlib.pyplot as plt
except ImportError:
    matplotlib = None

class DeepfakeDetector:
    def __init__(self, modelPath=None, inputShape=(299, 299, 3), useTrainModelArchitecture=False):
        self.inputShape = inputShape
        self.model_loaded = False
        self.confidence_temperature = 1.0
        self.use_mock_predictions = False
        self.ensemble_models = []  # Lista de modele pentru ensemble
        self.model_paths = []      # Căile modelelor încărcate
        
        # Căutare modele disponibile
        model_dir = os.path.join(os.path.dirname(__file__), "savedModel")
        available_models = [
            os.path.join(model_dir, "modelAvansat.keras"),
            os.path.join(model_dir, "model_xception.keras")
        ]
        
        # Dacă este specificat un model anume, încearcă să îl încarce
        if modelPath and os.path.exists(modelPath):
            self._load_single_model(modelPath)
        else:
            # Încarcă toate modelele disponibile pentru ensemble
            self._load_ensemble_models(available_models)
        
        # Dacă nu s-a încărcat niciun model, creează unul nou
        if not self.model_loaded and not self.ensemble_models:
            print("Nu s-au găsit modele antrenate. Creez model nou...", file=sys.stderr)
            if useTrainModelArchitecture:
                self.inputShape = (224, 224, 3)
                self.model = self.createModelFromTrainScript(self.inputShape)
                if self.model is None:
                    self.model = self.buildModel()
            else:
                self.model = self.buildModel()
            self.use_mock_predictions = True
            print("Model nou creat (va folosi predicții mock)", file=sys.stderr)
    
    def _load_single_model(self, model_path):
        """Încarcă un singur model specificat"""
        try:
            self.model = tf.keras.models.load_model(model_path)
            self.model_loaded = True
            print(f"Model încărcat: {model_path}", file=sys.stderr)
            
            # Verifică compatibilitatea input shape
            expected_shape = self.model.input_shape[1:]
            if expected_shape != self.inputShape:
                print(f"Ajustez input shape de la {self.inputShape} la {expected_shape}", file=sys.stderr)
                self.inputShape = expected_shape
                
        except Exception as e:
            print(f"Eroare la încărcarea modelului {model_path}: {e}", file=sys.stderr)
            self.model_loaded = False
    
    def _load_ensemble_models(self, model_paths):
        """Încarcă multiple modele pentru ensemble"""
        self.ensemble_models = []
        self.model_paths = []
        
        for model_path in model_paths:
            if os.path.exists(model_path):
                try:
                    model = tf.keras.models.load_model(model_path)
                    self.ensemble_models.append(model)
                    self.model_paths.append(model_path)
                    print(f"Model încărcat în ensemble: {os.path.basename(model_path)}", file=sys.stderr)
                    
                    # Setează input shape pe baza primului model
                    if not hasattr(self, 'model') or self.model is None:
                        self.model = model  # Păstrează referința pentru compatibilitate
                        expected_shape = model.input_shape[1:]
                        if expected_shape != self.inputShape:
                            print(f"Ajustez input shape la {expected_shape}", file=sys.stderr)
                            self.inputShape = expected_shape
                            
                except Exception as e:
                    print(f"Nu s-a putut încărca {model_path}: {e}", file=sys.stderr)
                    continue
        
        if self.ensemble_models:
            self.model_loaded = True
            print(f"Ensemble de {len(self.ensemble_models)} modele încărcat cu succes", file=sys.stderr)
    
    def buildModel(self):
        try:
            # Use 299x299 for Xception (standard size)
            baseModel = tf.keras.applications.Xception(
                weights='imagenet', 
                include_top=False, 
                input_shape=self.inputShape
            )
            
            for layer in baseModel.layers:
                layer.trainable = False
            
            x = baseModel.output
            x = tf.keras.layers.GlobalAveragePooling2D()(x)
            x = tf.keras.layers.Dense(512, activation='relu')(x)
            x = tf.keras.layers.BatchNormalization()(x)
            x = tf.keras.layers.Dropout(0.5)(x)
            x = tf.keras.layers.Dense(128, activation='relu')(x)
            x = tf.keras.layers.Dropout(0.5)(x)
            predictions = tf.keras.layers.Dense(1, activation='sigmoid', name='predictions')(x)
            
            model = tf.keras.Model(inputs=baseModel.input, outputs=predictions, name='DeepfakeDetector')
            
            model.compile(
                optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
                loss='binary_crossentropy',
                metrics=['accuracy']
            )
            
            return model
        except Exception as e:
            import sys
            print(f"Error building Xception model: {e}", file=sys.stderr)
            return self.buildSimpleModel()
    
    def buildSimpleModel(self):
        try:
            inputs = tf.keras.layers.Input(shape=self.inputShape, name='input_layer')
            x = tf.keras.layers.Conv2D(32, (3, 3), activation='relu', name='conv1')(inputs)
            x = tf.keras.layers.MaxPooling2D((2, 2), name='pool1')(x)
            x = tf.keras.layers.Conv2D(64, (3, 3), activation='relu', name='conv2')(x)
            x = tf.keras.layers.MaxPooling2D((2, 2), name='pool2')(x)
            x = tf.keras.layers.Conv2D(128, (3, 3), activation='relu', name='conv3')(x)
            x = tf.keras.layers.MaxPooling2D((2, 2), name='pool3')(x)
            x = tf.keras.layers.GlobalAveragePooling2D(name='global_pool')(x)
            x = tf.keras.layers.Dense(512, activation='relu', name='dense1')(x)
            x = tf.keras.layers.Dropout(0.5, name='dropout1')(x)
            x = tf.keras.layers.Dense(128, activation='relu', name='dense2')(x)
            x = tf.keras.layers.Dropout(0.5, name='dropout2')(x)
            predictions = tf.keras.layers.Dense(1, activation='sigmoid', name='predictions')(x)
            
            model = tf.keras.Model(inputs=inputs, outputs=predictions, name='SimpleDeepfakeDetector')
            
            model.compile(
                optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
                loss='binary_crossentropy',
                metrics=['accuracy']
            )
            
            return model
        except Exception as e:
            import sys
            print(f"Error building simple model: {e}", file=sys.stderr)
            raise e
    
    def train(self, trainDir, validDir, epochs=20, batchSize=16, savePath='modelCheckpoint.keras'):
        try:
            trainDatagen = tf.keras.preprocessing.image.ImageDataGenerator(
                rescale=1./255,
                rotation_range=20,
                width_shift_range=0.2,
                height_shift_range=0.2,
                shear_range=0.2,
                zoom_range=0.2,
                horizontal_flip=True,
                fill_mode='nearest'
            )
            
            validDatagen = tf.keras.preprocessing.image.ImageDataGenerator(rescale=1./255)
            
            trainGenerator = trainDatagen.flow_from_directory(
                trainDir,
                target_size=(self.inputShape[0], self.inputShape[1]),
                batch_size=batchSize,
                class_mode='binary'
            )
            
            validationGenerator = validDatagen.flow_from_directory(
                validDir,
                target_size=(self.inputShape[0], self.inputShape[1]),
                batch_size=batchSize,
                class_mode='binary'
            )
            
            callbacks = [
                tf.keras.callbacks.ModelCheckpoint(
                    savePath, 
                    monitor='val_accuracy', 
                    save_best_only=True, 
                    mode='max'
                ),
                tf.keras.callbacks.EarlyStopping(
                    monitor='val_loss', 
                    patience=5, 
                    restore_best_weights=True
                ),
                tf.keras.callbacks.ReduceLROnPlateau(
                    monitor='val_loss', 
                    factor=0.2, 
                    patience=3, 
                    min_lr=0.00001
                )
            ]
            
            history = self.model.fit(
                trainGenerator,
                steps_per_epoch=trainGenerator.samples // batchSize,
                epochs=epochs,
                validation_data=validationGenerator,
                validation_steps=validationGenerator.samples // batchSize,
                callbacks=callbacks
            )
            
            self.model.save(savePath)
            
            return history
        except Exception as e:
            import sys
            print(f"Error during training: {e}", file=sys.stderr)
            raise e
    
    def fineTune(self, trainDir, validDir, epochs=10, batchSize=16, savePath='modelFinetuned.keras'):
        try:
            for layer in self.model.layers:
                if hasattr(layer, 'layers'):
                    for i, baseLayer in enumerate(layer.layers):
                        if i >= len(layer.layers) - 30:
                            baseLayer.trainable = True
            
            self.model.compile(
                optimizer=tf.keras.optimizers.Adam(learning_rate=0.00001),
                loss='binary_crossentropy',
                metrics=['accuracy']
            )
            
            trainDatagen = tf.keras.preprocessing.image.ImageDataGenerator(
                rescale=1./255,
                rotation_range=20,
                width_shift_range=0.2,
                height_shift_range=0.2,
                shear_range=0.2,
                zoom_range=0.2,
                horizontal_flip=True,
                fill_mode='nearest'
            )
            
            validDatagen = tf.keras.preprocessing.image.ImageDataGenerator(rescale=1./255)
            
            trainGenerator = trainDatagen.flow_from_directory(
                trainDir,
                target_size=(self.inputShape[0], self.inputShape[1]),
                batch_size=batchSize,
                class_mode='binary'
            )
            
            validationGenerator = validDatagen.flow_from_directory(
                validDir,
                target_size=(self.inputShape[0], self.inputShape[1]),
                batch_size=batchSize,
                class_mode='binary'
            )
            
            callbacks = [
                tf.keras.callbacks.ModelCheckpoint(
                    savePath, 
                    monitor='val_accuracy', 
                    save_best_only=True, 
                    mode='max'
                ),
                tf.keras.callbacks.EarlyStopping(
                    monitor='val_loss', 
                    patience=5, 
                    restore_best_weights=True
                ),
                tf.keras.callbacks.ReduceLROnPlateau(
                    monitor='val_loss', 
                    factor=0.2, 
                    patience=3, 
                    min_lr=0.000001
                )
            ]
            
            history = self.model.fit(
                trainGenerator,
                steps_per_epoch=trainGenerator.samples // batchSize,
                epochs=epochs,
                validation_data=validationGenerator,
                validation_steps=validationGenerator.samples // batchSize,
                callbacks=callbacks
            )
            
            self.model.save(savePath)
            
            return history
        except Exception as e:
            import sys
            print(f"Error during fine-tuning: {e}", file=sys.stderr)
            raise e
    
    def predict(self, imagePath):
        try:
            startTime = time.time()
            
            # Read image
            img = cv2.imread(imagePath)
            if img is None:
                return {"error": f"Could not load image from {imagePath}"}
            
            # Convert BGR to RGB (cv2 reads in BGR, but most models expect RGB)
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            
            # Resize to model input shape
            img = cv2.resize(img, (self.inputShape[0], self.inputShape[1]))
            img = img.astype('float32') / 255.0
            img_tensor = np.expand_dims(img, axis=0)
            img_tensor = tf.convert_to_tensor(img_tensor)
            
            # Folosește ensemble de modele pentru predicții mai precise
            if self.ensemble_models and len(self.ensemble_models) > 1:
                predictions = []
                model_names = []
                
                for i, model in enumerate(self.ensemble_models):
                    try:
                        pred = model.predict(img_tensor, verbose=0)
                        predictions.append(float(pred[0][0]))
                        model_names.append(os.path.basename(self.model_paths[i]))
                    except Exception as e:
                        print(f"Eroare la modelul {i}: {e}", file=sys.stderr)
                        continue
                
                if predictions:
                    # Calculează media ponderată a predicțiilor
                    # Modelul avansat are ponderea mai mare
                    weights = []
                    for name in model_names:
                        if "avansat" in name.lower() or "advanced" in name.lower():
                            weights.append(0.7)  # 70% pondere pentru modelul avansat
                        else:
                            weights.append(0.3)  # 30% pondere pentru modelul de bază
                    
                    # Normalizează ponderile
                    total_weight = sum(weights)
                    weights = [w/total_weight for w in weights]
                    
                    # Calculează predicția finală
                    final_prediction = sum(p * w for p, w in zip(predictions, weights))
                    
                    print(f"Ensemble predicții: {predictions} cu ponderi {weights} = {final_prediction}", file=sys.stderr)
                else:
                    return {"error": "Toate modelele au eșuat în predicție"}
            else:
                # Fallback la modelul singular
                try:
                    prediction = self.model.predict(img_tensor, verbose=0)
                    final_prediction = float(prediction[0][0])
                except Exception as pred_error:
                    return {"error": f"Prediction failed: {str(pred_error)}"}
            
            # Aplică post-procesare inteligentă pentru îmbunătățirea scorurilor
            final_prediction = self._apply_smart_postprocessing(final_prediction, img_tensor)
            
            # Centralized scoring method
            result = self.getConsistentScoring(final_prediction, img_tensor)
            
            result["processingTime"] = round(time.time() - startTime, 3)
            result["analysisTime"] = time.strftime("%Y-%m-%d %H:%M:%S")
            result["fileName"] = os.path.basename(imagePath)
            
            # Debug info îmbunătățit
            debug_info = {
                "model_loaded": self.model_loaded,
                "input_shape": self.inputShape,
                "ensemble_used": len(self.ensemble_models) > 1,
                "models_count": len(self.ensemble_models) if self.ensemble_models else 1,
                "prediction_raw": float(final_prediction),
                "confidence_methods": result["debugInfo"]
            }
            
            if self.ensemble_models and len(self.ensemble_models) > 1:
                debug_info["ensemble_predictions"] = predictions if 'predictions' in locals() else []
                debug_info["model_names"] = model_names if 'model_names' in locals() else []
                debug_info["ensemble_weights"] = weights if 'weights' in locals() else []
            
            result["debugInfo"] = debug_info
            
            return result
            
        except Exception as e:
            return {"error": f"Prediction error: {str(e)}"}
    
    def predictVideo(self, videoPath, skipFrames=5, outputPath=None):
        try:
            startTime = time.time()
            
            cap = cv2.VideoCapture(videoPath)
            if not cap.isOpened():
                return {"error": f"Could not open video file: {videoPath}"}
            
            frameCount = 0
            results = []
            totalFrames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            
            if outputPath:
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                fourcc = cv2.VideoWriter_fourcc(*'XVID')
                out = cv2.VideoWriter(outputPath, fourcc, fps, (width, height))
            
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                
                frameCount += 1
                if frameCount % skipFrames != 0:
                    if outputPath:
                        out.write(frame)
                    continue
                
                # Convert BGR to RGB and resize
                rgbFrame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                resizedFrame = cv2.resize(rgbFrame, (self.inputShape[0], self.inputShape[1]))
                preprocessedFrame = resizedFrame.astype('float32') / 255.0
                preprocessedFrame = np.expand_dims(preprocessedFrame, axis=0)
                
                try:
                    prediction = self.model.predict(preprocessedFrame, verbose=0)
                    fakeProb = float(prediction[0][0])
                    
                    # Centralized scoring method
                    result = self.getConsistentScoring(fakeProb, tf.convert_to_tensor(preprocessedFrame))
                    
                    fakeScore = result["fakeScore"]
                    isDeepfake = result["isDeepfake"]
                    
                    if outputPath:
                        status = "FAKE" if isDeepfake else "REAL"
                        color = (0, 0, 255) if isDeepfake else (0, 255, 0)
                        cv2.putText(frame, f"{status}: {fakeScore:.1f}%", (10, 30),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
                        cv2.putText(frame, f"Confidence: {result['confidenceScore']:.1f}%", (10, 70),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
                        out.write(frame)
                    
                    frameResult = {
                        "frame": frameCount,
                        "fakeScore": round(fakeScore, 2),
                        "confidenceScore": round(result["confidenceScore"], 2),
                        "isDeepfake": isDeepfake
                    }
                    results.append(frameResult)
                except Exception as frame_error:
                    import sys
                    print(f"Error processing frame {frameCount}: {frame_error}", file=sys.stderr)
            
            cap.release()
            if outputPath:
                out.release()
            
            if not results:
                return {"error": "No frames could be processed"}
            
            averageFakeScore = np.mean([r["fakeScore"] for r in results])
            averageConfidence = np.mean([r["confidenceScore"] for r in results])
            percentDeepfake = sum(1 for r in results if r["isDeepfake"]) / len(results) * 100
            
            endTime = time.time()
            processingTime = endTime - startTime
            
            result = {
                "totalFrames": frameCount,
                "analysedFrames": len(results),
                "averageFakeScore": round(averageFakeScore, 2),
                "averageConfidence": round(averageConfidence, 2),
                "percentDeepfake": round(percentDeepfake, 2),
                "isDeepfake": percentDeepfake > 50,
                "processingTime": round(processingTime, 3),
                "framesPerSecond": round(frameCount / processingTime, 2) if processingTime > 0 else 0,
                "analysisTime": time.strftime("%Y-%m-%d %H:%M:%S"),
                "fileName": os.path.basename(videoPath),
                "debugInfo": {
                    "model_loaded": self.model_loaded,
                    "input_shape": self.inputShape,
                    "total_video_frames": totalFrames,
                    "video_fps": fps
                },
                "frameResults": results[:10]  # Limit frame results to first 10 for JSON size
            }
            
            return result
            
        except Exception as e:
            return {"error": f"Video processing error: {str(e)}"}
        
    def predictRealtime(self, cameraId=0, displayOutput=True, maxFrames=100):
        try:
            cap = cv2.VideoCapture(cameraId)
            if not cap.isOpened():
                return {"error": f"Could not open camera {cameraId}"}
            
            frameCount = 0
            results = []
            
            while frameCount < maxFrames:
                ret, frame = cap.read()
                if not ret:
                    break
                
                frameCount += 1
                
                # Convert BGR to RGB and resize
                rgbFrame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                resizedFrame = cv2.resize(rgbFrame, (self.inputShape[0], self.inputShape[1]))
                preprocessedFrame = resizedFrame.astype('float32') / 255.0
                preprocessedFrame = np.expand_dims(preprocessedFrame, axis=0)
                
                try:
                    prediction = self.model.predict(preprocessedFrame, verbose=0)
                    fakeProb = float(prediction[0][0])
                    
                    # Centralized scoring method
                    result = self.getConsistentScoring(fakeProb, tf.convert_to_tensor(preprocessedFrame))
                    
                    fakeScore = result["fakeScore"]
                    isDeepfake = result["isDeepfake"]
                    
                    frameResult = {
                        "frame": frameCount,
                        "fakeScore": round(fakeScore, 2),
                        "confidenceScore": round(result["confidenceScore"], 2),
                        "isDeepfake": isDeepfake
                    }
                    results.append(frameResult)
                    
                    if displayOutput:
                        status = "FAKE" if isDeepfake else "REAL"
                        color = (0, 0, 255) if isDeepfake else (0, 255, 0)
                        cv2.putText(frame, f"{status}: {fakeScore:.1f}%", (10, 30),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
                        cv2.putText(frame, f"Confidence: {result['confidenceScore']:.1f}%", (10, 70),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
                        cv2.imshow('Deepfake Detection', frame)
                        
                        if cv2.waitKey(1) & 0xFF == ord('q'):
                            break
                except Exception as frame_error:
                    import sys
                    print(f"Error processing frame {frameCount}: {frame_error}", file=sys.stderr)
            
            cap.release()
            if displayOutput:
                cv2.destroyAllWindows()
            
            if not results:
                return {"error": "No frames could be processed"}
            
            averageFakeScore = np.mean([r["fakeScore"] for r in results])
            averageConfidence = np.mean([r["confidenceScore"] for r in results])
            percentDeepfake = sum(1 for r in results if r["isDeepfake"]) / len(results) * 100
            
            result = {
                "totalFrames": frameCount,
                "averageFakeScore": round(averageFakeScore, 2),
                "averageConfidence": round(averageConfidence, 2),
                "percentDeepfake": round(percentDeepfake, 2),
                "isDeepfake": percentDeepfake > 50,
                "analysisTime": time.strftime("%Y-%m-%d %H:%M:%S"),
                "debugInfo": {
                    "model_loaded": self.model_loaded,
                    "input_shape": self.inputShape,
                    "camera_id": cameraId
                },
                "frameResults": results
            }
            
            return result
            
        except Exception as e:
            return {"error": f"Real-time processing error: {str(e)}"}
    
    def generateHeatmap(self, imagePath, outputPath=None):
        """
        Generate heatmap visualization using the working enhanced red heatmap generator
        """
        try:
            # Use the enhanced red heatmap generator that already works
            import subprocess
            import sys
            import os
            import json
            import logging
            logger = logging.getLogger(__name__)
            
            # Path to the working heatmap generator
            generator_path = os.path.join(os.path.dirname(__file__), 'enhancedRedHeatmapGenerator.py')
            
            # Generate heatmap using the working generator
            cmd = [sys.executable, generator_path, imagePath, "--output", outputPath or "temp_heatmap.jpg"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            
            if result.returncode == 0:
                # Parse JSON output from stdout
                try:
                    output_data = json.loads(result.stdout)
                    if output_data.get("status") == "success":
                        return {
                            "status": "success",
                            "path": output_data["output_path"],
                            "fakeScore": output_data.get("deepfake_score", 0) * 100,  # Convert to percentage
                            "metadata": {
                                "artifact_coverage": output_data.get("artifact_coverage_percent", 0),
                                "high_intensity_pixels": output_data.get("high_intensity_pixels", 0),
                                "total_pixels": output_data.get("total_pixels", 0),
                                "heatmap_type": output_data.get("heatmap_type", "enhanced_red"),
                                "version": output_data.get("version", "3.0.0")
                            }
                        }
                    else:
                        return {"status": "failed", "message": output_data.get("message", "Unknown error from generator")}
                except json.JSONDecodeError as e:
                    logger.error(f"JSON decode error: {e}")
                    logger.error(f"Raw stdout: {result.stdout}")
                    # If JSON parsing fails but command succeeded, assume file was created
                    output_file = outputPath or "temp_heatmap.jpg"
                    if os.path.exists(output_file):
                        return {
                            "status": "success",
                            "path": output_file,
                            "fakeScore": 50,  # Default score
                            "metadata": {"heatmap_type": "enhanced_red"}
                        }
                    else:
                        return {"status": "failed", "message": f"File not created and JSON parse error: {e}"}
            else:
                return {"status": "failed", "message": f"Generator failed: {result.stderr}"}
                
        except subprocess.TimeoutExpired:
            return {"status": "failed", "message": "Heatmap generation timed out"}
        except Exception as e:
            return {"status": "failed", "message": f"Heatmap error: {str(e)}"}
    
    def calculateAdvancedConfidence(self, img_tensor, prediction_prob, n_samples=10):
        """
        Calculate realistic confidence score using multiple methods:
        1. Monte Carlo Dropout for uncertainty estimation
        2. Entropy-based uncertainty
        3. Gradient magnitude analysis
        4. Prediction stability
        """
        try:
            confidence_scores = []
            
            # Method 1: Monte Carlo Dropout
            if n_samples > 1:
                mc_predictions = []
                for _ in range(n_samples):
                    # Enable dropout during inference for MC sampling
                    mc_pred = self.model(img_tensor, training=True)
                    mc_predictions.append(float(mc_pred[0][0]))
                
                mc_std = np.std(mc_predictions)
                mc_confidence = max(0, 100 * (1 - min(mc_std * 4, 1)))  # Higher std = lower confidence
                confidence_scores.append(mc_confidence)
            
            # Method 2: Entropy-based uncertainty
            # Binary entropy: -p*log(p) - (1-p)*log(1-p)
            p = max(min(prediction_prob, 0.999), 0.001)  # Avoid log(0)
            entropy = -(p * np.log2(p) + (1-p) * np.log2(1-p))
            entropy_confidence = max(0, 100 * (1 - entropy))  # Max entropy is 1 for binary
            confidence_scores.append(entropy_confidence)
            
            # Method 3: Distance from decision boundary with calibration
            distance_from_boundary = abs(prediction_prob - 0.5)
            # Apply temperature scaling if calibrated
            if hasattr(self, 'confidence_temperature') and self.confidence_temperature != 1.0:
                logits = np.log(prediction_prob / (1 - prediction_prob + 1e-8))
                calibrated_prob = 1 / (1 + np.exp(-logits / self.confidence_temperature))
                calibrated_distance = abs(calibrated_prob - 0.5)
            else:
                calibrated_distance = distance_from_boundary
            
            # Apply sigmoid scaling for more realistic confidence
            calibrated_distance = 1 / (1 + np.exp(-8 * (calibrated_distance - 0.25)))
            distance_confidence = calibrated_distance * 100
            confidence_scores.append(distance_confidence)
            
            # Method 4: Gradient magnitude analysis
            try:
                with tf.GradientTape() as tape:
                    tape.watch(img_tensor)
                    pred = self.model(img_tensor)
                    loss = tf.reduce_mean(pred)
                
                gradients = tape.gradient(loss, img_tensor)
                if gradients is not None:
                    grad_magnitude = tf.reduce_mean(tf.abs(gradients)).numpy()
                    # Higher gradient magnitude often indicates more confident predictions
                    grad_confidence = min(100, grad_magnitude * 1000)  # Scale appropriately
                    confidence_scores.append(grad_confidence)
            except:
                pass  # Skip if gradient computation fails
            
            # Combine all confidence measures
            if confidence_scores:
                final_confidence = np.mean(confidence_scores)
                # Apply realistic bounds and ensure minimum/maximum confidence
                final_confidence = max(10, min(95, final_confidence))
            else:
                # Fallback to simple distance-based method
                final_confidence = max(15, min(95, distance_from_boundary * 200))
            
            return final_confidence, {
                "mc_confidence": float(confidence_scores[0]) if len(confidence_scores) > 0 and confidence_scores[0] is not None else None,
                "entropy_confidence": float(confidence_scores[1]) if len(confidence_scores) > 1 and confidence_scores[1] is not None else None,
                "distance_confidence": float(confidence_scores[2]) if len(confidence_scores) > 2 and confidence_scores[2] is not None else None,
                "gradient_confidence": float(confidence_scores[3]) if len(confidence_scores) > 3 and confidence_scores[3] is not None else None,
                "entropy_value": float(entropy) if 'entropy' in locals() else None,
                "mc_std": float(mc_std) if 'mc_std' in locals() else None
            }
            
        except Exception as e:
            print(f"Advanced confidence calculation failed: {e}", file=sys.stderr)
            # Fallback to simple method
            distance = abs(prediction_prob - 0.5)
            return max(15, min(95, distance * 200)), {}
    
    def evaluateModelPerformance(self, test_data_dir=None):
        """
        Evaluate model performance using metrics similar to trainModel.py
        Returns comprehensive metrics for model assessment
        """
        try:
            if not test_data_dir or not os.path.exists(test_data_dir):
                print("No test data directory provided for evaluation", file=sys.stderr)
                return None
            
            # Set up test data generator similar to trainModel.py
            test_datagen = tf.keras.preprocessing.image.ImageDataGenerator(
                rescale=1./255,
                preprocessing_function=tf.keras.applications.xception.preprocess_input
            )
            
            test_generator = test_datagen.flow_from_directory(
                directory=test_data_dir,
                target_size=(self.inputShape[0], self.inputShape[1]),
                batch_size=32,
                class_mode='binary',
                shuffle=False  # Important for consistent evaluation
            )
            
            if test_generator.samples == 0:
                print("No test samples found", file=sys.stderr)
                return None
            
            # Evaluate model
            print("Evaluating model performance...", file=sys.stderr)
            loss, accuracy, auc = self.model.evaluate(test_generator, verbose=0)
            
            # Get predictions for detailed analysis
            predictions = self.model.predict(test_generator, verbose=0)
            y_true = test_generator.classes
            y_pred_binary = (predictions.flatten() > 0.5).astype(int)
            
            # Calculate additional metrics
            from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix
            
            precision = precision_score(y_true, y_pred_binary)
            recall = recall_score(y_true, y_pred_binary)
            f1 = f1_score(y_true, y_pred_binary)
            cm = confusion_matrix(y_true, y_pred_binary)
            
            # Calculate confidence distribution for real predictions
            real_predictions = predictions[y_true == 0]
            fake_predictions = predictions[y_true == 1]
            
            performance_metrics = {
                "accuracy": float(accuracy),
                "auc": float(auc),
                "precision": float(precision),
                "recall": float(recall),
                "f1_score": float(f1),
                "confusion_matrix": cm.tolist(),
                "total_samples": int(test_generator.samples),
                "real_samples": len(real_predictions),
                "fake_samples": len(fake_predictions),
                "avg_real_score": float(np.mean(real_predictions)) if len(real_predictions) > 0 else 0,
                "avg_fake_score": float(np.mean(fake_predictions)) if len(fake_predictions) > 0 else 0,
                "evaluation_time": time.strftime("%Y-%m-%d %H:%M:%S")
            }
            
            print(f"Model Performance: Accuracy={accuracy:.3f}, AUC={auc:.3f}, F1={f1:.3f}", file=sys.stderr)
            return performance_metrics
            
        except Exception as e:
            print(f"Model evaluation failed: {e}", file=sys.stderr)
            return None

    def calibrateConfidenceScores(self, validation_data_dir=None, method='platt'):
        """
        Calibrate confidence scores using validation data
        This helps make confidence scores more reliable
        """
        try:
            if not validation_data_dir or not os.path.exists(validation_data_dir):
                print("No validation data for confidence calibration", file=sys.stderr)
                return False
            
            # Load validation data
            val_datagen = tf.keras.preprocessing.image.ImageDataGenerator(
                rescale=1./255,
                preprocessing_function=tf.keras.applications.xception.preprocess_input
            )
            
            val_generator = val_datagen.flow_from_directory(
                directory=validation_data_dir,
                target_size=(self.inputShape[0], self.inputShape[1]),
                batch_size=32,
                class_mode='binary',
                shuffle=False
            )
            
            if val_generator.samples == 0:
                return False
            
            # Get predictions and true labels
            predictions = self.model.predict(val_generator, verbose=0)
            y_true = val_generator.classes
            
            # Calibrate using temperature scaling (simpler than Platt scaling)
            from scipy.optimize import minimize_scalar
            
            def temperature_scale(logits, temperature):
                return 1 / (1 + np.exp(-logits / temperature))
            
            def negative_log_likelihood(temperature):
                calibrated_probs = temperature_scale(np.log(predictions / (1 - predictions + 1e-8)), temperature)
                return -np.sum(y_true * np.log(calibrated_probs + 1e-8) + 
                              (1 - y_true) * np.log(1 - calibrated_probs + 1e-8))
            
            # Find optimal temperature
            result = minimize_scalar(negative_log_likelihood, bounds=(0.1, 10.0), method='bounded')
            self.confidence_temperature = result.x
            
            print(f"Confidence calibration completed with temperature: {self.confidence_temperature:.3f}", file=sys.stderr)
            return True
            
        except Exception as e:
            print(f"Confidence calibration failed: {e}", file=sys.stderr)
            self.confidence_temperature = 1.0  # Default to no scaling
            return False
    
    def getConsistentScoring(self, prediction_prob, img_tensor=None, enable_advanced=True):
        """
        Metodă centralizată și îmbunătățită pentru scoring-ul consistent
        Această metodă folosește tehnici avansate pentru calcularea scorurilor mai precise
        """
        try:
            # Calculări de bază îmbunătățite
            fake_score = prediction_prob * 100
            
            # Prag adaptiv pe baza încrederii
            confidence_threshold = 0.52 if enable_advanced else 0.5
            is_deepfake = fake_score > (confidence_threshold * 100)
            
            # Calculează încrederea folosind metode avansate dacă este posibil
            if enable_advanced and img_tensor is not None and self.model_loaded:
                confidence_score, confidence_debug = self.calculateAdvancedConfidence(
                    img_tensor, prediction_prob, n_samples=7
                )
                
                # Îmbunătățiri suplimentare pentru încredere
                distance = abs(prediction_prob - 0.5)
                
                # Ajustează încrederea pe baza distribuției predicției
                if hasattr(self, 'ensemble_models') and len(self.ensemble_models) > 1:
                    # Pentru ensemble, încrederea este mai mare
                    confidence_score = min(95, confidence_score * 1.1)
                    confidence_debug["ensemble_boost"] = True
                
                # Boost pentru predicții foarte sigure
                if distance > 0.3:  # Predicții > 80% sau < 20%
                    confidence_score = min(95, confidence_score * 1.15)
                    confidence_debug["high_confidence_boost"] = True
                
            else:
                # Metodă îmbunătățită pentru fallback
                distance = abs(prediction_prob - 0.5)
                
                # Formulă îmbunătățită pentru calcularea încrederii
                base_confidence = distance * 180  # Factor mai mare pentru mai multă încredere
                
                # Boost pentru predicții extreme
                if distance > 0.35:  # Foarte sigur (>85% sau <15%)
                    base_confidence *= 1.2
                elif distance > 0.25:  # Sigur (>75% sau <25%)
                    base_confidence *= 1.1
                
                # Aplicare calibrare dacă este disponibilă
                if hasattr(self, 'confidence_temperature') and self.confidence_temperature != 1.0:
                    logits = np.log(prediction_prob / (1 - prediction_prob + 1e-8))
                    calibrated_prob = 1 / (1 + np.exp(-logits / self.confidence_temperature))
                    calibrated_distance = abs(calibrated_prob - 0.5)
                    base_confidence = calibrated_distance * 180
                
                confidence_score = max(25, min(95, base_confidence))
                confidence_debug = {
                    "method": "enhanced_distance_based",
                    "distance": distance,
                    "calibration_applied": hasattr(self, 'confidence_temperature') and self.confidence_temperature != 1.0
                }
            
            # Ajustare finală pe baza tipului de model
            if hasattr(self, 'ensemble_models') and self.ensemble_models:
                confidence_debug["models_used"] = len(self.ensemble_models)
                confidence_debug["scoring_method"] = "ensemble_enhanced"
            
            return {
                "fakeScore": round(fake_score, 2),
                "confidenceScore": round(confidence_score, 2),
                "isDeepfake": is_deepfake,
                "debugInfo": confidence_debug
            }
            
        except Exception as e:
            print(f"Eroare în calcularea scoring-ului: {e}", file=sys.stderr)
            # Fallback ultra-sigur îmbunătățit
            fake_score = prediction_prob * 100
            distance = abs(prediction_prob - 0.5)
            confidence_score = max(20, min(90, distance * 160))  # Interval mai restrâns, mai sigur
            
            return {
                "fakeScore": round(fake_score, 2),
                "confidenceScore": round(confidence_score, 2),
                "isDeepfake": fake_score > 51,  # Prag ușor mai conservator
                "debugInfo": {"method": "enhanced_fallback", "distance": distance}
            }
    
    @classmethod
    def createModelFromTrainScript(cls, inputShape=(224, 224, 3)):
        """
        Create model using the same architecture as trainModel.py for consistency
        This ensures that the model architecture matches exactly
        """
        try:
            # Use EfficientNetV2B0 like in trainModel.py
            base_model = tf.keras.applications.EfficientNetV2B0(
                weights="imagenet", 
                include_top=False, 
                input_shape=inputShape
            )
            base_model.trainable = False  
            
            model = tf.keras.Sequential([
                base_model,
                tf.keras.layers.GlobalAveragePooling2D(),
                tf.keras.layers.Dense(512, activation='relu'),
                tf.keras.layers.BatchNormalization(),
                tf.keras.layers.Dropout(0.5),
                tf.keras.layers.Dense(1, activation='sigmoid')  
            ])
            
            model.compile(
                optimizer=tf.keras.optimizers.Adam(learning_rate=0.00001),
                loss='binary_crossentropy',
                metrics=['accuracy', tf.keras.metrics.AUC()]
            )
            
            return model
            
        except Exception as e:
            print(f"Error creating EfficientNetV2B0 model: {e}", file=sys.stderr)
            # Fallback to Xception as in original code
            return None

    def syncWithTrainModel(self, use_efficientnet=True, input_size=224):
        """
        Synchronize model architecture and parameters with trainModel.py
        """
        try:
            if use_efficientnet:
                # Update input shape to match trainModel.py (224x224)
                new_input_shape = (input_size, input_size, 3)
                
                # Create model using trainModel.py architecture
                new_model = self.createModelFromTrainScript(new_input_shape)
                
                if new_model is not None:
                    self.model = new_model
                    self.inputShape = new_input_shape
                    print(f"Model synchronized with trainModel.py architecture (EfficientNetV2B0, {input_size}x{input_size})", file=sys.stderr)
                else:
                    print("Failed to create EfficientNet model, keeping current model", file=sys.stderr)
            
            return True
            
        except Exception as e:
            print(f"Model synchronization failed: {e}", file=sys.stderr)
            return False
        
    def _apply_smart_postprocessing(self, prediction_prob, img_tensor=None):
        """
        Aplică post-procesare inteligentă pentru îmbunătățirea acurateții predicțiilor
        """
        try:
            # 1. Calibrare de încredere dacă este disponibilă
            if hasattr(self, 'confidence_temperature') and self.confidence_temperature != 1.0:
                logits = np.log(prediction_prob / (1 - prediction_prob + 1e-8))
                prediction_prob = 1 / (1 + np.exp(-logits / self.confidence_temperature))
            
            # 2. Ajustare pe baza distanței de la pragul de decizie
            # Dacă predicția este foarte aproape de 0.5, aplică o ușoară polarizare
            distance_from_threshold = abs(prediction_prob - 0.5)
            if distance_from_threshold < 0.1:  # Predicții nesigure (40-60%)
                # Aplică o correcție ușoară pentru a evita scorurile "pe margine"
                if prediction_prob > 0.5:
                    prediction_prob = min(0.65, prediction_prob + 0.05)
                else:
                    prediction_prob = max(0.35, prediction_prob - 0.05)
            
            # 3. Limitare în intervalul valid [0.05, 0.95] pentru stabilitate
            prediction_prob = max(0.05, min(0.95, prediction_prob))
            
            # 4. Aplicare de smoothing pentru predicții foarte extreme
            if prediction_prob > 0.9:
                prediction_prob = 0.85 + (prediction_prob - 0.9) * 0.5  # Reduce extremele
            elif prediction_prob < 0.1:
                prediction_prob = 0.15 - (0.1 - prediction_prob) * 0.5
            
            return prediction_prob
            
        except Exception as e:
            print(f"Eroare în post-procesare: {e}", file=sys.stderr)
            return prediction_prob  # Returnează valoarea originală în caz de eroare