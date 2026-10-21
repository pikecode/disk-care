"""只读核验 macOS 交付应用的完整签名、版本及身份。"""
import json
import plistlib
import subprocess
import sys
from pathlib import Path


def verify(bundle: Path) -> None:
    project = Path(__file__).resolve().parent.parent
    config = json.loads((project / "src-tauri/tauri.conf.json").read_text())
    info = plistlib.loads((bundle / "Contents/Info.plist").read_bytes())
    if info.get("CFBundleIdentifier") != config["identifier"]:
        raise ValueError("应用包标识与配置不一致")
    if info.get("CFBundleShortVersionString") != config["version"]:
        raise ValueError("应用包版本与配置不一致")
    result = subprocess.run(
        ["/usr/bin/codesign", "--verify", "--deep", "--strict", str(bundle)],
        capture_output=True, text=True,
    )
    if result.returncode:
        raise ValueError("完整签名校验失败：" + result.stderr.strip())
    if not (bundle / "Contents/_CodeSignature/CodeResources").is_file():
        raise ValueError("应用包缺少签名资源清单")
    result = subprocess.run(
        ["/usr/bin/codesign", "--display", "--verbose=2", str(bundle)],
        capture_output=True, text=True,
    )
    expected = "Identifier=" + config["identifier"]
    if result.returncode or expected not in result.stderr.splitlines():
        raise ValueError("代码签名标识与应用包标识不一致")
    print(f"通过：{info['CFBundleShortVersionString']} · {config['identifier']} · 完整应用包签名有效")
    print("签名有效不代表系统已授权；临时签名不保证升级后的授权保留。")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("用法：python3 scripts/verify-macos-bundle.py 应用路径")
        verify(Path(sys.argv[1]))
    except (OSError, ValueError, plistlib.InvalidFileException) as error:
        print(f"交付检查失败：{error}", file=sys.stderr)
        sys.exit(1)
