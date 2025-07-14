#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wrapper pentru Enhanced Red Heatmap Generator
Integrează noul generator în sistemul existent
"""

import os
import sys
import json
import argparse
from pathlib import Path

# Adaugă directorul curent în path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

try:
    from enhancedRedHeatmapGenerator import EnhancedRedHeatmapGenerator
except ImportError as e:
    print(json.dumps({
        "status": "error",
        "message": f"Could not import EnhancedRedHeatmapGenerator: {str(e)}"
    }))
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description='Enhanced Red Heatmap Generator Wrapper')
    parser.add_argument('image_path', help='Path to input image')
    parser.add_argument('--output', help='Output path for heatmap')
    parser.add_argument('--model', help='Path to model file')
    parser.add_argument('--user-id', help='User ID for tracking')
    parser.add_argument('--tier', default='premium', help='User tier (basic/premium)')
    parser.add_argument('--features', help='Comma-separated list of features')
    parser.add_argument('--no-legend', action='store_true', help='Disable legend')
    parser.add_argument('--format', default='json', choices=['json', 'simple'], 
                       help='Output format')
    
    args = parser.parse_args()
    
    try:
        # Validează fișierul de intrare
        if not os.path.exists(args.image_path):
            raise FileNotFoundError(f"Input image not found: {args.image_path}")
        
        # Verifică dacă este o imagine validă
        valid_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff'}
        if Path(args.image_path).suffix.lower() not in valid_extensions:
            raise ValueError(f"Unsupported image format. Supported: {', '.join(valid_extensions)}")
        
        # Inițializează generatorul
        generator = EnhancedRedHeatmapGenerator(args.model)
        
        # Generează heatmap-ul îmbunătățit
        result = generator.generate_enhanced_heatmap(
            args.image_path,
            args.output,
            add_legend=not args.no_legend
        )
        
        # Adaugă informații suplimentare pentru integrare
        if result.get("status") == "success":
            result.update({
                "user_id": args.user_id,
                "tier": args.tier,
                "features_used": args.features.split(',') if args.features else [],
                "wrapper_version": "1.0.0",
                "enhanced_red_features": {
                    "artifact_highlighting": True,
                    "intensity_mapping": True,
                    "statistical_analysis": True,
                    "legend_included": not args.no_legend
                }
            })
        
        # Output în formatul dorit
        if args.format == 'json':
            print(json.dumps(result, indent=2))
        else:
            # Format simplu pentru debugging
            if result.get("status") == "success":
                print(f"SUCCESS: {result.get('output_path')}")
                print(f"Deepfake Score: {result.get('deepfake_score', 'N/A')}")
                print(f"Artifact Coverage: {result.get('artifact_coverage_percent', 'N/A')}%")
            else:
                print(f"ERROR: {result.get('message', 'Unknown error')}")
        
    except Exception as e:
        error_result = {
            "status": "error",
            "message": str(e),
            "user_id": args.user_id,
            "tier": args.tier,
            "wrapper_version": "1.0.0"
        }
        
        if args.format == 'json':
            print(json.dumps(error_result))
        else:
            print(f"ERROR: {str(e)}")
        
        sys.exit(1)

if __name__ == "__main__":
    main()
