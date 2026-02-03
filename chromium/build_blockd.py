#!/usr/bin/env python3
"""
Blockd Browser Build Script
Builds the Blockd Interview Browser from the Chromium source with proper branding.

Requirements:
- depot_tools installed and in PATH
- Chromium source code checked out
- Python 3.9+ with Pillow
- ~100GB disk space, 16GB+ RAM

Usage:
    python build_blockd.py [--platform windows|macos|linux] [--release] [--clean]
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

# Build configuration
CHROMIUM_DIR = Path(__file__).parent.resolve()
BRANDING_DIR = CHROMIUM_DIR / "blocked_backup" / "chrome" / "app" / "theme" / "blocked"
ARGS_GN_FILE = CHROMIUM_DIR / "args.gn"

# Build arguments for Blockd browser
BUILD_ARGS_COMMON = """
# Blockd Browser Build Configuration
is_official_build = true
is_debug = false
symbol_level = 0
enable_nacl = false

# Branding
chrome_product_short_name = "Blockd"
chrome_product_full_name = "Blockd"

# Blockd-specific features
blockd_enable_security_monitoring = true
blockd_enable_eye_tracking = true
blockd_enable_telemetry = true
blockd_enable_video_capture = true
blockd_enable_media_streaming = true

# Default URLs
blockd_backend_url = "wss://api.blockd.site"
blockd_default_homepage = "https://app.blockd.site/session"
blockd_startup_url = "https://app.blockd.site/login"
blockd_meeting_patterns = "meet.google.com,*.zoom.us,zoom.us,teams.microsoft.com,teams.live.com"
"""

BUILD_ARGS_WINDOWS = """
target_os = "win"
target_cpu = "x64"
is_component_build = false
"""

BUILD_ARGS_MACOS = """
target_os = "mac"
target_cpu = "x64"
is_component_build = false
"""

BUILD_ARGS_LINUX = """
target_os = "linux"
target_cpu = "x64"
is_component_build = false
use_sysroot = true
"""

BUILD_ARGS_DEBUG = """
is_debug = true
symbol_level = 2
is_component_build = true
"""


def log_info(msg):
    print(f"\033[34m[INFO]\033[0m {msg}")


def log_success(msg):
    print(f"\033[32m[SUCCESS]\033[0m {msg}")


def log_warning(msg):
    print(f"\033[33m[WARNING]\033[0m {msg}")


def log_error(msg):
    print(f"\033[31m[ERROR]\033[0m {msg}")


def run_command(cmd, cwd=None, check=True):
    """Run a shell command."""
    log_info(f"Running: {cmd}")
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd or CHROMIUM_DIR,
        capture_output=False
    )
    if check and result.returncode != 0:
        log_error(f"Command failed with exit code {result.returncode}")
        sys.exit(1)
    return result


def check_prerequisites():
    """Check if all build prerequisites are met."""
    log_info("Checking build prerequisites...")

    # Check for depot_tools
    gn_path = shutil.which("gn")
    if not gn_path:
        log_error("depot_tools not found. Please install depot_tools and add to PATH.")
        log_error("See: https://commondatastorage.googleapis.com/chrome-infra-docs/flat/depot_tools/docs/html/depot_tools_tutorial.html")
        return False

    # Check for ninja
    ninja_path = shutil.which("ninja")
    if not ninja_path:
        log_error("ninja not found. Should be in depot_tools.")
        return False

    # Check for Python with Pillow
    try:
        from PIL import Image
        log_info("Pillow library found")
    except ImportError:
        log_warning("Pillow not found. Installing...")
        run_command("pip install Pillow")

    log_success("All prerequisites met")
    return True


def generate_icons():
    """Generate browser icons from source logo."""
    log_info("Generating browser icons...")

    icon_script = BRANDING_DIR / "generate_icons.py"
    if not icon_script.exists():
        log_error(f"Icon generation script not found: {icon_script}")
        return False

    run_command(f"python \"{icon_script}\"")
    log_success("Icons generated")
    return True


def setup_branding():
    """Copy branding files to the correct Chromium directories."""
    log_info("Setting up Blockd branding...")

    # Verify BRANDING file has correct content
    branding_file = BRANDING_DIR / "BRANDING"
    if branding_file.exists():
        content = branding_file.read_text()
        if "Blockd" not in content:
            log_warning("BRANDING file may not have correct Blockd branding")
    else:
        log_error(f"BRANDING file not found: {branding_file}")
        return False

    # Check for generated icons
    icon_16 = BRANDING_DIR / "product_logo_16.png"
    if not icon_16.exists():
        log_warning("Icons not found. Generating...")
        if not generate_icons():
            return False

    log_success("Branding setup complete")
    return True


def write_args_gn(platform, release=True):
    """Write the args.gn file for the build."""
    log_info(f"Writing build configuration for {platform}...")

    args = BUILD_ARGS_COMMON

    if platform == "windows":
        args += BUILD_ARGS_WINDOWS
    elif platform == "macos":
        args += BUILD_ARGS_MACOS
    elif platform == "linux":
        args += BUILD_ARGS_LINUX

    if not release:
        args += BUILD_ARGS_DEBUG

    ARGS_GN_FILE.write_text(args)
    log_success(f"Build configuration written to {ARGS_GN_FILE}")


def build_browser(out_dir="out/Blockd", jobs=None):
    """Build the Blockd browser."""
    log_info("Starting Chromium build...")

    # Generate build files
    run_command(f"gn gen {out_dir}")

    # Build
    ninja_cmd = f"ninja -C {out_dir} chrome"
    if jobs:
        ninja_cmd += f" -j{jobs}"

    run_command(ninja_cmd)

    log_success("Build complete!")
    return True


def clean_build(out_dir="out/Blockd"):
    """Clean the build directory."""
    log_info(f"Cleaning build directory: {out_dir}")

    build_path = CHROMIUM_DIR / out_dir
    if build_path.exists():
        shutil.rmtree(build_path)
        log_success("Build directory cleaned")
    else:
        log_info("Build directory does not exist, nothing to clean")


def main():
    parser = argparse.ArgumentParser(
        description="Build the Blockd Interview Browser"
    )
    parser.add_argument(
        "--platform",
        choices=["windows", "macos", "linux"],
        default="windows",
        help="Target platform (default: windows)"
    )
    parser.add_argument(
        "--release",
        action="store_true",
        default=True,
        help="Build release version (default)"
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Build debug version"
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean build directory before building"
    )
    parser.add_argument(
        "--icons-only",
        action="store_true",
        help="Only generate icons, don't build"
    )
    parser.add_argument(
        "--jobs", "-j",
        type=int,
        help="Number of parallel build jobs"
    )
    parser.add_argument(
        "--out-dir",
        default="out/Blockd",
        help="Output directory (default: out/Blockd)"
    )

    args = parser.parse_args()

    print("=" * 60)
    print("  Blockd Interview Browser Build")
    print("=" * 60)
    print()

    # Icons only mode
    if args.icons_only:
        generate_icons()
        return

    # Check prerequisites
    if not check_prerequisites():
        sys.exit(1)

    # Clean if requested
    if args.clean:
        clean_build(args.out_dir)

    # Setup branding
    if not setup_branding():
        sys.exit(1)

    # Write build configuration
    release = not args.debug
    write_args_gn(args.platform, release)

    # Build
    if not build_browser(args.out_dir, args.jobs):
        sys.exit(1)

    print()
    print("=" * 60)
    print(f"  Build Complete!")
    print(f"  Output: {CHROMIUM_DIR / args.out_dir}")
    print("=" * 60)


if __name__ == "__main__":
    main()
