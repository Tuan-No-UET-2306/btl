from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
YOLOV5_EXPORT = REPO_ROOT / "src" / "yolov5" / "export.py"
DEFAULT_WEIGHTS = (
    REPO_ROOT / "src" / "models" / "LP_detector_nano_61.pt",
    REPO_ROOT / "src" / "models" / "LP_ocr_nano_62.pt",
)


def repo_path(path: str | Path) -> Path:
    value = Path(path)
    if value.is_absolute():
        return value
    return (REPO_ROOT / value).resolve()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert YOLOv5 .pt model weights to .onnx.",
    )
    parser.add_argument(
        "--weights",
        nargs="+",
        type=Path,
        default=list(DEFAULT_WEIGHTS),
        help="One or more .pt files. Defaults to both LPR models in src/models.",
    )
    parser.add_argument(
        "--imgsz",
        "--img",
        nargs="+",
        type=int,
        default=[640, 640],
        help="Export image size. Use one value for square size, or two values for height width.",
    )
    parser.add_argument("--batch-size", type=int, default=1, help="ONNX export batch size.")
    parser.add_argument("--device", default="cpu", help="cpu, 0, 0,1,...")
    parser.add_argument("--opset", type=int, default=18, help="ONNX opset version.")
    parser.add_argument("--dynamic", action="store_true", help="Enable dynamic batch/height/width axes.")
    parser.add_argument("--simplify", action="store_true", help="Simplify ONNX graph if onnx-simplifier is installed.")
    parser.add_argument("--half", action="store_true", help="Export FP16 model. Requires CUDA device.")
    return parser.parse_args()


def build_export_command(weight: Path, args: argparse.Namespace) -> list[str]:
    cmd = [
        sys.executable,
        str(YOLOV5_EXPORT),
        "--weights",
        str(weight),
        "--include",
        "onnx",
        "--imgsz",
        *(str(size) for size in args.imgsz),
        "--batch-size",
        str(args.batch_size),
        "--device",
        args.device,
        "--opset",
        str(args.opset),
    ]

    if args.dynamic:
        cmd.append("--dynamic")
    if args.simplify:
        cmd.append("--simplify")
    if args.half:
        cmd.append("--half")

    return cmd


def remove_unused_external_data_file(onnx_path: Path) -> None:
    sidecar_path = Path(f"{onnx_path}.data")
    if not sidecar_path.exists():
        return

    try:
        import onnx

        model = onnx.load_model(onnx_path, load_external_data=False)
        has_external_data = any(
            initializer.data_location == onnx.TensorProto.EXTERNAL
            for initializer in model.graph.initializer
        )
    except Exception:
        return

    if not has_external_data:
        sidecar_path.unlink()


def convert_weight(weight: Path, args: argparse.Namespace) -> Path:
    weight = repo_path(weight)
    if not weight.exists():
        raise FileNotFoundError(f"Weight file not found: {weight}")
    if weight.suffix.lower() != ".pt":
        raise ValueError(f"Expected a .pt file, got: {weight}")

    subprocess.run(build_export_command(weight, args), cwd=REPO_ROOT, check=True)

    onnx_path = weight.with_suffix(".onnx")
    if not onnx_path.exists():
        raise RuntimeError(f"Export finished but ONNX file was not created: {onnx_path}")

    remove_unused_external_data_file(onnx_path)
    return onnx_path


def main() -> int:
    args = parse_args()

    exported: list[Path] = []
    for weight in args.weights:
        exported.append(convert_weight(weight, args))

    print("\nExported ONNX files:")
    for path in exported:
        print(f"- {path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())