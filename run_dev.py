#!/usr/bin/env python3
"""
Development server launcher with .env file support
"""
import os
import sys
import subprocess
from pathlib import Path

def load_env_file(env_file=".env"):
    """Load environment variables from .env file and return as dict"""
    env_path = Path(env_file)
    
    if not env_path.exists():
        print(f"Warning: {env_file} not found!")
        print("Copy .env.example to .env and configure it.")
        return None
    
    print(f"Loading environment variables from {env_file}...")
    
    env_vars = os.environ.copy()
    
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            # Skip empty lines and comments
            if not line or line.startswith('#'):
                continue
            
            # Parse KEY=VALUE
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                
                # Remove quotes if present
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                
                env_vars[key] = value
                print(f"  ✓ {key}={value}")
    
    return env_vars

if __name__ == "__main__":
    # Get the script directory (project root)
    script_dir = Path(__file__).parent.resolve()
    
    # Load .env file from project root
    os.chdir(script_dir)
    
    env_vars = load_env_file()
    if env_vars is None:
        sys.exit(1)
    
    print("\nStarting ACARS Hub development server...")
    print("-" * 50)
    
    # Change to webapp directory so relative paths work
    webapp_dir = script_dir / "rootfs" / "webapp"
    
    # Run acarshub.py as a subprocess with the loaded environment
    try:
        result = subprocess.run(
            [sys.executable, "acarshub.py"],
            cwd=str(webapp_dir),
            env=env_vars,
        )
        sys.exit(result.returncode)
    except KeyboardInterrupt:
        print("\n\nShutting down development server...")
        sys.exit(0)
