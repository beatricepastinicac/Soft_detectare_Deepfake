#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wrapper for Advanced Heatmap Generator - Backend Integration
Provides Node.js compatible interface for premium heatmap generation
"""

import sys
import json
import os
import traceback
from pathlib import Path

# Add current directory to path for imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

try:
    from heatmapGeneratorAvansat import HeatmapGeneratorAvansat
except ImportError as e:
    print(json.dumps({
        'success': False,
        'error': f'Import error: {str(e)}',
        'type': 'import_error'
    }))
    sys.exit(1)

def extract_user_info(data):
    """Extract user information from input data"""
    user_info = {
        'is_premium': False,
        'user_id': None,
        'tier': 'free'
    }
    
    if isinstance(data, dict):
        user_info['is_premium'] = (
            data.get('userTier') == 'premium' or 
            data.get('tier') == 'premium' or
            data.get('isPremium', False) or
            data.get('enableAdvancedFeatures', False)
        )
        user_info['user_id'] = data.get('userId') or data.get('user_id')
        user_info['tier'] = data.get('userTier') or data.get('tier', 'free')
    
    return user_info

def validate_input(data):
    """Validate input data"""
    if not isinstance(data, dict):
        raise ValueError("Input must be a JSON object")
    
    if 'image_path' not in data:
        raise ValueError("Missing required field: image_path")
    
    image_path = data['image_path']
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")
    
    return True

def format_response(results, user_info):
    """Format response for backend consumption"""
    if not results.get('success', False):
        return {
            'success': False,
            'error': results.get('error', 'Unknown error'),
            'user_info': user_info
        }
    
    # Base response
    response = {
        'success': True,
        'heatmap_path': results.get('heatmap_path'),
        'is_premium_analysis': user_info['is_premium'],
        'user_tier': user_info['tier'],
        'version': results.get('version', '2.0.0-premium')
    }
    
    # Add premium features if user is premium
    if user_info['is_premium']:
        response.update({
            'premium_features': results.get('premium_features', []),
            'detailed_statistics': results.get('statistics', {}),
            'layer_analysis': {
                layer_name: {
                    'confidence': layer_data.get('confidence', 0),
                    'max_activation': layer_data.get('max_activation', 0)
                }
                for layer_name, layer_data in results.get('layer_analysis', {}).items()
            },
            'analysis_summary': results.get('analysis_summary', {}),
            'metadata': results.get('metadata', {})
        })
        
        # Extract key statistics for easy access
        stats = results.get('statistics', {})
        if stats:
            response['heatmap_stats'] = {
                'overall_confidence': stats.get('overall_metrics', {}).get('avg_confidence', 0),
                'detection_strength': stats.get('overall_metrics', {}).get('detection_strength', 0),
                'layers_analyzed': len(results.get('layer_analysis', {})),
                'consistency_score': stats.get('overall_metrics', {}).get('consistency_score', 0)
            }
    else:
        # For non-premium users, provide basic information
        response.update({
            'message': 'Basic heatmap generated. Upgrade to Premium for advanced features.',
            'premium_features_available': [
                'multi_layer_analysis',
                'high_resolution_processing', 
                'enhanced_visualization',
                'detailed_statistics'
            ]
        })
    
    return response

def main():
    """Main wrapper function"""
    try:
        # Read input from stdin or command line arguments
        if len(sys.argv) > 1:
            # Command line mode
            input_data = {
                'image_path': sys.argv[1],
                'userTier': sys.argv[2] if len(sys.argv) > 2 else 'free',
                'output_path': sys.argv[3] if len(sys.argv) > 3 else None
            }
        else:
            # Stdin mode (for Node.js integration)
            input_line = sys.stdin.read().strip()
            if not input_line:
                raise ValueError("No input data provided")
            input_data = json.loads(input_line)
        
        # Validate input
        validate_input(input_data)
        
        # Extract user information
        user_info = extract_user_info(input_data)
        
        # Initialize generator
        generator = HeatmapGeneratorAvansat()
        
        # Generate heatmap (premium features automatically enabled based on user tier)
        results = generator.generate_premium_heatmap(
            input_data['image_path'],
            input_data.get('output_path')
        )
        
        # Format response
        response = format_response(results, user_info)
        
        # Output JSON response
        print(json.dumps(response, ensure_ascii=False, indent=2))
        
    except json.JSONDecodeError as e:
        error_response = {
            'success': False,
            'error': f'JSON decode error: {str(e)}',
            'type': 'json_error'
        }
        print(json.dumps(error_response))
        sys.exit(1)
        
    except FileNotFoundError as e:
        error_response = {
            'success': False,
            'error': str(e),
            'type': 'file_not_found'
        }
        print(json.dumps(error_response))
        sys.exit(1)
        
    except Exception as e:
        error_response = {
            'success': False,
            'error': str(e),
            'type': 'general_error',
            'traceback': traceback.format_exc()
        }
        print(json.dumps(error_response))
        sys.exit(1)

if __name__ == "__main__":
    main()
