#!/usr/bin/env python3
"""
Blockd Browser Icon Generator
Generates browser icons from the SVG icon source.

For browser icons, we use ONLY the "B" icon mark (no wordmark text)
since text becomes illegible at small sizes like 16px and 32px.
"""

import os
import shutil
import sys
from pathlib import Path

# Icon sizes needed for all platforms
ICON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]

def find_source_files():
    """Find the source icon files."""
    script_dir = Path(__file__).parent.resolve()

    # Look for source files
    sources = {
        'svg': None,
        'favicon': None,
        'logo_png': None,
    }

    # SVG icon (preferred - icon only, no wordmark)
    svg_paths = [
        script_dir / "../../../../../../frontend/interviewer-app/src/assets/logo-icon.svg",
        Path("C:/InstalledPrograms/Programming/Blockd/Blockd/frontend/interviewer-app/src/assets/logo-icon.svg"),
    ]

    # Favicon (already has proper icon)
    favicon_paths = [
        script_dir / "../../../../../../Blockd_Landing/src/app/favicon.ico",
        Path("C:/InstalledPrograms/Programming/Blockd/Blockd_Landing/src/app/favicon.ico"),
    ]

    # Full logo PNG (fallback)
    png_paths = [
        script_dir / "../../../../../../Blockd_Landing/New_Logos_Colors/BLOCKD_Primary_logo.png",
        Path("C:/InstalledPrograms/Programming/Blockd/Blockd_Landing/New_Logos_Colors/BLOCKD_Primary_logo.png"),
        script_dir / "../../../../../../Blockd_Landing/public/logo.png",
        Path("C:/InstalledPrograms/Programming/Blockd/Blockd_Landing/public/logo.png"),
    ]

    for path in svg_paths:
        if path.resolve().exists():
            sources['svg'] = path.resolve()
            break

    for path in favicon_paths:
        if path.resolve().exists():
            sources['favicon'] = path.resolve()
            break

    for path in png_paths:
        if path.resolve().exists():
            sources['logo_png'] = path.resolve()
            break

    return sources


def generate_from_svg(svg_path: Path, output_dir: Path):
    """Generate PNG icons from SVG using cairosvg."""
    try:
        import cairosvg
    except ImportError:
        print("cairosvg not found. Install with: pip install cairosvg")
        return False

    print(f"Generating icons from SVG: {svg_path}")

    for size in ICON_SIZES:
        output_path = output_dir / f"product_logo_{size}.png"
        cairosvg.svg2png(
            url=str(svg_path),
            write_to=str(output_path),
            output_width=size,
            output_height=size,
            background_color="white"
        )
        print(f"  Generated: product_logo_{size}.png ({size}x{size})")

    return True


def generate_from_png(png_path: Path, output_dir: Path, crop_to_icon=True):
    """Generate icons from PNG, optionally cropping to just the icon portion."""
    try:
        from PIL import Image
    except ImportError:
        print("Pillow not found. Install with: pip install Pillow")
        return False

    print(f"Generating icons from PNG: {png_path}")

    with Image.open(png_path) as img:
        # Convert to RGBA
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        if crop_to_icon:
            # The logo has the "B" icon on top and "BLOCKD" text below
            # Crop to just the top portion (the B icon)
            # Original image is roughly square with icon taking ~70% height
            width, height = img.size

            # Find the bounding box of non-transparent pixels
            bbox = img.getbbox()
            if bbox:
                # Crop to content first
                img = img.crop(bbox)
                width, height = img.size

                # Now crop to just the top ~65% (the B icon without wordmark)
                # The wordmark is roughly the bottom 35%
                icon_height = int(height * 0.65)
                img = img.crop((0, 0, width, icon_height))

                # Make it square by padding
                width, height = img.size
                max_dim = max(width, height)

                # Create square canvas with transparent background
                square_img = Image.new('RGBA', (max_dim, max_dim), (255, 255, 255, 0))

                # Center the icon
                x_offset = (max_dim - width) // 2
                y_offset = (max_dim - height) // 2
                square_img.paste(img, (x_offset, y_offset), img)
                img = square_img

        print(f"  Working image size: {img.size}")

        # Generate each size
        for size in ICON_SIZES:
            output_path = output_dir / f"product_logo_{size}.png"
            resized = img.resize((size, size), Image.Resampling.LANCZOS)

            # Convert to RGB with white background for better compatibility
            rgb_img = Image.new('RGB', (size, size), (255, 255, 255))
            rgb_img.paste(resized, mask=resized.split()[3] if resized.mode == 'RGBA' else None)
            rgb_img.save(output_path, 'PNG', optimize=True)

            print(f"  Generated: product_logo_{size}.png ({size}x{size})")

    return True


def copy_favicon(favicon_path: Path, output_dir: Path):
    """Copy the existing favicon as blockd.ico."""
    dest = output_dir / "blockd.ico"
    shutil.copy(favicon_path, dest)
    print(f"  Copied favicon to: blockd.ico")
    return True


def generate_ico_from_pngs(output_dir: Path):
    """Generate ICO file from the generated PNGs."""
    try:
        from PIL import Image
    except ImportError:
        return False

    # Windows ICO needs these sizes
    ico_sizes = [16, 32, 48, 256]
    images = []

    for size in ico_sizes:
        png_path = output_dir / f"product_logo_{size}.png"
        if png_path.exists():
            img = Image.open(png_path)
            images.append(img)

    if images:
        ico_path = output_dir / "blockd.ico"
        images[0].save(
            ico_path,
            format='ICO',
            sizes=[(img.size[0], img.size[1]) for img in images],
            append_images=images[1:]
        )
        print(f"  Generated: blockd.ico (Windows multi-resolution)")
        return True

    return False


def generate_installer_logo(output_dir: Path):
    """Generate Windows installer logo."""
    try:
        from PIL import Image
    except ImportError:
        return False

    # Use the 256px icon
    icon_path = output_dir / "product_logo_256.png"
    if not icon_path.exists():
        return False

    with Image.open(icon_path) as icon:
        # Windows installer banner is typically 164x314
        installer_size = (164, 314)
        installer_img = Image.new('RGB', installer_size, (255, 255, 255))

        # Scale icon to fit width with padding
        icon_size = 140
        icon_resized = icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS)

        # Convert to RGB if needed
        if icon_resized.mode == 'RGBA':
            rgb_icon = Image.new('RGB', (icon_size, icon_size), (255, 255, 255))
            rgb_icon.paste(icon_resized, mask=icon_resized.split()[3])
            icon_resized = rgb_icon

        # Center horizontally, place near top
        x_offset = (installer_size[0] - icon_size) // 2
        y_offset = 30
        installer_img.paste(icon_resized, (x_offset, y_offset))

        installer_path = output_dir / "installer_logo.bmp"
        installer_img.save(installer_path, 'BMP')
        print(f"  Generated: installer_logo.bmp (Windows installer)")

    return True


def main():
    script_dir = Path(__file__).parent.resolve()

    print("=" * 50)
    print("Blockd Browser Icon Generator")
    print("=" * 50)
    print()
    print("NOTE: For browser icons, we use only the 'B' icon mark")
    print("      (no wordmark text) for clarity at small sizes.")
    print()

    # Find source files
    sources = find_source_files()

    print("Found sources:")
    for key, path in sources.items():
        status = f"  {path}" if path else "  NOT FOUND"
        print(f"  {key}: {status}")
    print()

    success = False

    # Try SVG first (best quality)
    if sources['svg']:
        success = generate_from_svg(sources['svg'], script_dir)

    # Fall back to PNG with cropping
    if not success and sources['logo_png']:
        print("SVG generation failed, trying PNG with icon cropping...")
        success = generate_from_png(sources['logo_png'], script_dir, crop_to_icon=True)

    if not success:
        print("ERROR: Could not generate icons from any source.")
        print("Please ensure either:")
        print("  - cairosvg is installed (pip install cairosvg)")
        print("  - Or Pillow is installed (pip install Pillow)")
        sys.exit(1)

    # Copy or generate ICO
    if sources['favicon']:
        copy_favicon(sources['favicon'], script_dir)
    else:
        generate_ico_from_pngs(script_dir)

    # Generate installer logo
    generate_installer_logo(script_dir)

    print()
    print("=" * 50)
    print("Icon generation complete!")
    print(f"Output directory: {script_dir}")
    print("=" * 50)


if __name__ == "__main__":
    main()
