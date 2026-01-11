#!/usr/bin/env python3
"""
Generate app icons in all required sizes for Chromium browser branding.

This script generates PNG icons from a source image in all sizes required for:
- Windows: 16, 32, 48, 256
- macOS: 16, 32, 128, 256, 512, 1024
- Linux: 16, 32, 48, 64, 128, 256

Usage:
    python generate_icons.py [source_image]

If no source image is provided, defaults to logo_source.png in the same directory.

Requirements:
    - Pillow (pip install Pillow)
"""

import subprocess
import sys
from pathlib import Path


def main():
    script_dir = Path(__file__).parent
    source_image = script_dir / "logo_source.png"

    if len(sys.argv) > 1:
        source_image = Path(sys.argv[1])

    if not source_image.exists():
        print(f"Error: Source image not found: {source_image}")
        sys.exit(1)

    # All required sizes (union of Windows, macOS, and Linux requirements)
    sizes = [16, 32, 48, 64, 128, 256, 512, 1024]

    print(f"Generating icons from: {source_image}")

    for size in sizes:
        output_file = script_dir / f"product_logo_{size}.png"

        try:
            # Use macOS sips command to resize
            subprocess.run([
                "sips",
                "-z", str(size), str(size),  # Resize to size x size
                str(source_image),
                "--out", str(output_file)
            ], check=True, capture_output=True)

            print(f"  Created: product_logo_{size}.png")
        except subprocess.CalledProcessError as e:
            print(f"  Error creating {size}x{size}: {e.stderr.decode()}")
        except FileNotFoundError:
            print("  Error: sips command not found. This script requires macOS.")
            print("  On other platforms, use ImageMagick or Pillow directly.")
            sys.exit(1)

    print("\nIcon generation complete!")
    print("\nNext steps:")
    print("  1. Review generated icons for quality")
    print("  2. Run generate_ico.py to create Windows .ico file")
    print("  3. Run generate_icns.py to create macOS .icns file")


if __name__ == "__main__":
    main()
