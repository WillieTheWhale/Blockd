#!/usr/bin/env python3
"""
Cluely Process Detection Test Script

This script tests the process detection logic used by Blockd Browser to detect
the Cluely interview cheating application and related tools.

Usage:
    python scripts/test_cluely_detection.py [--live]

Options:
    --live    Also scan running processes on the current system

The script tests:
1. Detection of Cluely official application
2. Detection of Interview Coder (original name)
3. Detection of open-source Cluely variants
4. Detection of other AI assistants (ChatGPT, Claude)
5. That benign processes are NOT flagged as suspicious
"""

import argparse
import platform
import sys
from typing import List, Tuple

# =============================================================================
# Suspicious Process Lists (must match the C++ implementation)
# =============================================================================

# Windows suspicious processes (from windows_security_monitor.h)
WINDOWS_SUSPICIOUS_PROCESSES = [
    # Screen recording software
    "obs64.exe",
    "obs32.exe",
    "obs.exe",
    "camtasia.exe",
    "camtasiastudio.exe",
    "bandicam.exe",
    "fraps.exe",
    "xsplit.broadcaster.exe",
    # Remote desktop software
    "teamviewer.exe",
    "anydesk.exe",
    "chrome-remote-desktop-host.exe",
    # AI assistants
    "chatgpt.exe",
    "claude.exe",
    # Cluely interview cheating tool (https://cluely.com)
    "cluely.exe",
    "cluely",
    # Interview Coder (original name / open-source variant)
    "interview coder.exe",
    "interview-coder.exe",
    "interviewcoder.exe",
    # Free/open-source Cluely variants
    "free-cluely.exe",
    "freecluely.exe",
]

# macOS suspicious processes (from macos_security_monitor.h)
MACOS_SUSPICIOUS_PROCESSES = [
    # Screen recording software
    "obs",
    "quicktime player",
    "screen recording",
    "camtasia",
    # Remote desktop software
    "teamviewer",
    "anydesk",
    # AI assistants
    "chatgpt",
    "claude",
    # Cluely interview cheating tool (https://cluely.com)
    "cluely",
    # Interview Coder (original name / open-source variant)
    "interview coder",
    "interview-coder",
    "interviewcoder",
    # Free/open-source Cluely variants
    "free-cluely",
    "freecluely",
]


def is_suspicious_process(process_name: str, suspicious_list: List[str]) -> bool:
    """
    Check if a process name matches any suspicious process pattern.

    This mirrors the logic in IsSuspiciousProcess() in the C++ code:
    - Convert to lowercase
    - Check if any suspicious string is contained in the process name
    """
    name_lower = process_name.lower()
    for suspicious in suspicious_list:
        if suspicious.lower() in name_lower:
            return True
    return False


def run_detection_tests() -> Tuple[int, int]:
    """Run all process detection tests and return (passed, failed) counts."""

    # Use combined list for testing
    suspicious_list = list(set(
        [p.lower() for p in WINDOWS_SUSPICIOUS_PROCESSES] +
        [p.lower() for p in MACOS_SUSPICIOUS_PROCESSES]
    ))

    passed = 0
    failed = 0

    def test(name: str, process: str, expected: bool):
        nonlocal passed, failed
        result = is_suspicious_process(process, suspicious_list)
        status = "PASS" if result == expected else "FAIL"
        if result != expected:
            failed += 1
            print(f"  [{status}] {name}: '{process}' - expected {expected}, got {result}")
        else:
            passed += 1
            print(f"  [{status}] {name}: '{process}'")

    print("\n" + "=" * 60)
    print("CLUELY DETECTION TESTS")
    print("=" * 60)

    # Test 1: Official Cluely detection
    print("\n1. Official Cluely Application Detection:")
    test("Windows exe", "cluely.exe", True)
    test("Windows exe (uppercase)", "Cluely.exe", True)
    test("macOS process", "Cluely", True)
    test("macOS process (lowercase)", "cluely", True)
    test("With helper suffix", "cluely-helper", True)

    # Test 2: Interview Coder detection
    print("\n2. Interview Coder Detection (original name):")
    test("Windows with spaces", "Interview Coder.exe", True)
    test("Lowercase", "interview coder", True)
    test("Hyphenated", "interview-coder.exe", True)
    test("CamelCase", "InterviewCoder", True)
    test("No separator", "interviewcoder.exe", True)

    # Test 3: Free/open-source variants
    print("\n3. Free/Open-Source Cluely Variants:")
    test("Hyphenated exe", "free-cluely.exe", True)
    test("CamelCase", "Free-Cluely", True)
    test("No hyphen exe", "freecluely.exe", True)
    test("No hyphen", "FreeCluely", True)

    # Test 4: Other AI assistants
    print("\n4. Other AI Assistants:")
    test("ChatGPT exe", "chatgpt.exe", True)
    test("ChatGPT", "ChatGPT", True)
    test("Claude exe", "claude.exe", True)
    test("Claude", "Claude", True)

    # Test 5: Screen recording software
    print("\n5. Screen Recording Software:")
    test("OBS 64-bit", "obs64.exe", True)
    test("OBS generic", "obs.exe", True)
    test("Camtasia", "camtasia.exe", True)
    test("Bandicam", "bandicam.exe", True)

    # Test 6: Remote desktop software
    print("\n6. Remote Desktop Software:")
    test("TeamViewer", "teamviewer.exe", True)
    test("AnyDesk", "anydesk.exe", True)

    # Test 7: Benign processes should NOT be flagged
    print("\n7. Benign Processes (should NOT be flagged):")
    test("Chrome", "chrome.exe", False)
    test("Notepad", "notepad.exe", False)
    test("Explorer", "explorer.exe", False)
    test("System", "System", False)
    test("Finder", "Finder", False)
    test("Safari", "Safari", False)
    test("Zoom", "zoom.exe", False)  # Meeting app, not cheating tool
    test("Slack", "slack.exe", False)
    test("VS Code", "code.exe", False)
    test("Terminal", "Terminal", False)
    test("Python", "python.exe", False)
    test("Node", "node.exe", False)

    # Test 8: Case insensitivity
    print("\n8. Case Insensitivity:")
    test("CLUELY uppercase", "CLUELY", True)
    test("Cluely mixed", "ClUeLy", True)
    test("OBS uppercase", "OBS", True)
    test("obs lowercase", "obs", True)

    return passed, failed


def scan_live_processes():
    """Scan running processes on the current system for suspicious activity."""

    print("\n" + "=" * 60)
    print("LIVE PROCESS SCAN")
    print("=" * 60)

    system = platform.system()
    print(f"\nPlatform: {system}")

    suspicious_list = (
        WINDOWS_SUSPICIOUS_PROCESSES if system == "Windows"
        else MACOS_SUSPICIOUS_PROCESSES
    )

    processes = []
    suspicious_found = []

    if system == "Windows":
        try:
            import subprocess
            result = subprocess.run(
                ["tasklist", "/fo", "csv", "/nh"],
                capture_output=True,
                text=True
            )
            for line in result.stdout.strip().split("\n"):
                if line:
                    # Parse CSV: "process.exe","PID","Session","Session#","Mem"
                    parts = line.split(",")
                    if parts:
                        name = parts[0].strip('"')
                        processes.append(name)
                        if is_suspicious_process(name, suspicious_list):
                            suspicious_found.append(name)
        except Exception as e:
            print(f"Error scanning processes: {e}")
            return

    elif system == "Darwin":  # macOS
        try:
            import subprocess
            result = subprocess.run(
                ["ps", "-e", "-o", "comm="],
                capture_output=True,
                text=True
            )
            for line in result.stdout.strip().split("\n"):
                name = line.strip()
                if name:
                    processes.append(name)
                    if is_suspicious_process(name, suspicious_list):
                        suspicious_found.append(name)
        except Exception as e:
            print(f"Error scanning processes: {e}")
            return
    else:
        print(f"Live scan not supported on {system}")
        return

    print(f"\nTotal processes scanned: {len(processes)}")

    if suspicious_found:
        print(f"\n*** SUSPICIOUS PROCESSES DETECTED: {len(suspicious_found)} ***")
        for proc in sorted(set(suspicious_found)):
            print(f"  - {proc}")
    else:
        print("\nNo suspicious processes detected.")

    # Check specifically for Cluely
    cluely_processes = [p for p in processes if "cluely" in p.lower()]
    if cluely_processes:
        print(f"\n*** CLUELY DETECTED ***")
        for proc in cluely_processes:
            print(f"  - {proc}")


def main():
    parser = argparse.ArgumentParser(
        description="Test Cluely process detection logic"
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Also scan running processes on the current system"
    )

    args = parser.parse_args()

    print("Blockd Browser - Cluely Process Detection Test")
    print(f"Platform: {platform.system()} {platform.release()}")

    # Run unit tests
    passed, failed = run_detection_tests()

    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Total:  {passed + failed}")

    if failed > 0:
        print("\n*** SOME TESTS FAILED ***")
    else:
        print("\n*** ALL TESTS PASSED ***")

    # Run live scan if requested
    if args.live:
        scan_live_processes()

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
