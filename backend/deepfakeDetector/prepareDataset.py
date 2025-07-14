import os
import argparse
import shutil
from tqdm import tqdm
import cv2
import numpy as np
from sklearn.model_selection import train_test_split

def processFolder(inputDir, outputDir, subdirName, face_cascade, minFaceSize=100):
    inputSubdir = os.path.join(inputDir, subdirName)
    if not os.path.exists(inputSubdir):
        print(f"Warning: {inputSubdir} does not exist")
        return 0
    
    if os.path.isdir(inputSubdir):
        if subdirName.lower() == 'fake' or subdirName.lower() == 'real':
            outputSubdir = os.path.join(outputDir, subdirName.lower())
            os.makedirs(outputSubdir, exist_ok=True)
            
            imageCount = 0
            for root, dirs, files in os.walk(inputSubdir):
                for file in tqdm(files, desc=f"Processing {root}"):
                    if file.lower().endswith(('.png', '.jpg', '.jpeg')):
                        imagePath = os.path.join(root, file)
                        try:
                            img = cv2.imread(imagePath)
                            if img is None:
                                continue
                            
                            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                            faces = face_cascade.detectMultiScale(gray, 1.1, 5)
                            
                            if len(faces) == 0:
                                newPath = os.path.join(outputSubdir, f"{os.path.splitext(file)[0]}.jpg")
                                resizedImg = cv2.resize(img, (256, 256))
                                cv2.imwrite(newPath, resizedImg)
                                imageCount += 1
                            else:
                                for i, (x, y, w, h) in enumerate(faces):
                                    if w < minFaceSize or h < minFaceSize:
                                        continue
                                    
                                    marginX = int(w * 0.15)
                                    marginY = int(h * 0.15)
                                    
                                    x1 = max(0, x - marginX)
                                    y1 = max(0, y - marginY)
                                    x2 = min(img.shape[1], x + w + marginX)
                                    y2 = min(img.shape[0], y + h + marginY)
                                    
                                    faceImg = img[y1:y2, x1:x2]
                                    
                                    faceFilename = f"{os.path.splitext(file)[0]}_face{i}.jpg"
                                    facePath = os.path.join(outputSubdir, faceFilename)
                                    
                                    resizedFace = cv2.resize(faceImg, (256, 256))
                                    cv2.imwrite(facePath, resizedFace)
                                    imageCount += 1
                        except Exception as e:
                            print(f"Error processing {imagePath}: {e}")
            
            return imageCount
        else:
            totalCount = 0
            for subdir in os.listdir(inputSubdir):
                count = processFolder(inputSubdir, outputDir, subdir, face_cascade, minFaceSize)
                totalCount += count
            return totalCount
    return 0

def extractFaces(inputDir, outputDir, minFaceSize=100, trainSplit=0.8, valSplit=0.1, testSplit=0.1):
    os.makedirs(os.path.join(outputDir, 'train', 'real'), exist_ok=True)
    os.makedirs(os.path.join(outputDir, 'train', 'fake'), exist_ok=True)
    os.makedirs(os.path.join(outputDir, 'val', 'real'), exist_ok=True)
    os.makedirs(os.path.join(outputDir, 'val', 'fake'), exist_ok=True)
    os.makedirs(os.path.join(outputDir, 'test', 'real'), exist_ok=True)
    os.makedirs(os.path.join(outputDir, 'test', 'fake'), exist_ok=True)
    
    faceCascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    
    tempDir = os.path.join(outputDir, 'temp')
    os.makedirs(tempDir, exist_ok=True)
    os.makedirs(os.path.join(tempDir, 'real'), exist_ok=True)
    os.makedirs(os.path.join(tempDir, 'fake'), exist_ok=True)
    
    for className in ['fake', 'real']:
        processFolder(inputDir, tempDir, className, faceCascade, minFaceSize)
    
    for className in ['real', 'fake']:
        classDir = os.path.join(tempDir, className)
        if not os.path.exists(classDir):
            print(f"Warning: {classDir} does not exist, skipping")
            continue
            
        imageFiles = [f for f in os.listdir(classDir) 
                     if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        
        trainFiles, tempFiles = train_test_split(imageFiles, test_size=(valSplit + testSplit), random_state=42)
        
        ratio = testSplit / (valSplit + testSplit)
        valFiles, testFiles = train_test_split(tempFiles, test_size=ratio, random_state=42)
        
        print(f"Processing {className} images: {len(trainFiles)} train, {len(valFiles)} val, {len(testFiles)} test")
        
        for splitName, files in [('train', trainFiles), ('val', valFiles), ('test', testFiles)]:
            splitOutputDir = os.path.join(outputDir, splitName, className)
            
            for imgFile in tqdm(files, desc=f"Copying {splitName} {className}"):
                imgPath = os.path.join(classDir, imgFile)
                targetPath = os.path.join(splitOutputDir, imgFile)
                shutil.copy(imgPath, targetPath)
    
    shutil.rmtree(tempDir)
    print(f"Dataset preparation complete. Output directory: {outputDir}")

def main():
    parser = argparse.ArgumentParser(description='Prepare dataset for deepfake detection')
    parser.add_argument('--inputDir', required=True, help='Input directory with real/fake subfolders')
    parser.add_argument('--outputDir', required=True, help='Output directory for processed dataset')
    parser.add_argument('--minFaceSize', type=int, default=100, help='Minimum size for face detection')
    parser.add_argument('--trainSplit', type=float, default=0.8, help='Proportion of data for training')
    parser.add_argument('--valSplit', type=float, default=0.1, help='Proportion of data for validation')
    parser.add_argument('--testSplit', type=float, default=0.1, help='Proportion of data for testing')
    
    args = parser.parse_args()
    
    if args.trainSplit + args.valSplit + args.testSplit != 1.0:
        print("Error: Split proportions must sum to 1.0")
        return
    
    extractFaces(
        args.inputDir, 
        args.outputDir,
        minFaceSize=args.minFaceSize,
        trainSplit=args.trainSplit,
        valSplit=args.valSplit,
        testSplit=args.testSplit
    )

if __name__ == "__main__":
    main()