#!/usr/bin/env python3
import argparse
import re
import sys
from pathlib import Path

PATTERNS = [
    {
        "id": "RAW_FORMATTING",
        "severity": "HIGH",
        "pattern": re.compile(r'(\|\s*f:format\.raw\(\)|\{\s*([\w\.]+)\s*->\s*f:format\.raw\(\)\}|<f:format\.raw>(.*?)</f:format\.raw>|\|\s*format\.raw\(\))', re.IGNORECASE),
        "message": "Raw output formatting detected (f:format.raw). Context-aware escaping is disabled!"
    },
    {
        "id": "ESCAPING_DISABLED",
        "severity": "HIGH",
        "pattern": re.compile(r'escapeOutput\s*=\s*["\']false["\']', re.IGNORECASE),
        "message": "Output escaping is explicitly disabled (escapeOutput=\"false\")."
    },
    {
        "id": "UNSANITIZED_HTML_VIEWHELPER",
        "severity": "MEDIUM",
        "pattern": re.compile(r'(<f:format\.html[^>]*>|\{\s*[\w\.]+\s*->\s*f:format\.html\(\)\})', re.IGNORECASE),
        "message": "f:format.html detected. Ensure strict HTMLPurifier / Sanitizer configuration is applied."
    },
    {
        "id": "INLINE_EVENT_HANDLER_XSS",
        "severity": "HIGH",
        "pattern": re.compile(r'on[a-z]+\s*=\s*["\'].*?\{.*?\}', re.IGNORECASE),
        "message": "Fluid variable used inside inline JS event handler. Vulnerable to Context-XSS!"
    },
    {
        "id": "JAVASCRIPT_URI_XSS",
        "severity": "HIGH",
        "pattern": re.compile(r'href\s*=\s*["\']javascript:.*?\{.*?\}', re.IGNORECASE),
        "message": "Fluid variable used inside javascript: URI scheme."
    }
]

def fix_line_raw_formatting(line: str) -> tuple[str, int]:
    replacements = 0
    p1 = re.compile(r'\{\s*([\w\.\(\)]+)\s*->\s*f:format\.raw\(\)\}', re.IGNORECASE)
    line, n1 = p1.subn(r'{\1}', line)
    replacements += n1

    p2 = re.compile(r'\s*\|\s*f:format\.raw\(\)', re.IGNORECASE)
    line, n2 = p2.subn('', line)
    replacements += n2

    p3 = re.compile(r'<f:format\.raw>(.*?)</f:format\.raw>', re.IGNORECASE | re.DOTALL)
    line, n3 = p3.subn(r'\1', line)
    replacements += n3

    p4 = re.compile(r'escapeOutput\s*=\s*["\']false["\']', re.IGNORECASE)
    line, n4 = p4.subn('escapeOutput="true"', line)
    replacements += n4

    p5 = re.compile(r'escapeChildren\s*=\s*["\']false["\']', re.IGNORECASE)
    line, n5 = p5.subn('escapeChildren="true"', line)
    replacements += n5

    return line, replacements

def scan_file(file_path: Path, apply_fix: bool = False) -> tuple[list[dict], bool]:
    findings = []
    file_modified = False

    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()

        new_lines = []
        for line_num, line in enumerate(lines, start=1):
            line_has_issue = False
            for check in PATTERNS:
                if check["pattern"].search(line):
                    line_has_issue = True
                    findings.append({
                        "line": line_num,
                        "severity": check["severity"],
                        "rule_id": check["id"],
                        "message": check["message"],
                        "snippet": line.strip()
                    })

            if apply_fix and line_has_issue:
                fixed_line, count = fix_line_raw_formatting(line)
                if count > 0:
                    file_modified = True
                    new_lines.append(fixed_line)
                else:
                    new_lines.append(line)
            else:
                new_lines.append(line)

        if apply_fix and file_modified:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)

    except Exception as e:
        print(f"Error processing file {file_path}: {e}", file=sys.stderr)

    return findings, file_modified

def main():
    parser = argparse.ArgumentParser(description="TYPO3 Fluid Template Security Scanner & Auto-Fixer")
    parser.add_argument("path", nargs="?", default=".", help="Path to Fluid templates directory or file")
    parser.add_argument("--fix", action="store_true", help="Automatically fix f:format.raw() and disable unsafe escaping")
    args = parser.parse_args()

    target_path = Path(args.path)

    if not target_path.exists():
        print(f"Error: Path '{args.path}' does not exist.")
        sys.exit(1)

    print(f"Scanning Fluid templates in '{target_path.resolve()}'...")
    total_files = 0
    total_issues = 0
    modified_files_count = 0

    html_files = [target_path] if target_path.is_file() else list(target_path.glob('**/*.html'))

    for file_path in html_files:
        if 'vendor' in file_path.parts or 'node_modules' in file_path.parts:
            continue

        total_files += 1
        findings, modified = scan_file(file_path, apply_fix=args.fix)

        if modified:
            modified_files_count += 1

        if findings:
            status_str = " [FIXED]" if modified else ""
            print(f"File: {file_path}{status_str}")
            for item in findings:
                total_issues += 1
                print(f"  Line {item['line']} [{item['severity']}] {item['rule_id']}: {item['message']}")
                print(f"    Snippet: {item['snippet']}")
            print()

    print("-" * 65)
    print(f"Scan summary: Scanned {total_files} file(s). Found {total_issues} security issue(s).")
    if args.fix:
        print(f"Auto-fix summary: Updated {modified_files_count} file(s).")

    if total_issues > 0 and not args.fix:
        sys.exit(1)

if __name__ == "__main__":
    main()
