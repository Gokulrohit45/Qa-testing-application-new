import os
import subprocess
from pathlib import Path
from utils.logger import logger

def convert_mp4_to_y4m(input_path: str, output_path: str) -> bool:
    """
    Converts an uploaded MP4 video file to Y4M (YUV4MPEG2 640x480 @ 30fps) format
    for Chromium virtual camera injection.
    Tries ffmpeg CLI first, falls back to OpenCV (cv2) processing if ffmpeg is missing.
    """
    input_p = Path(input_path)
    output_p = Path(output_path)

    if not input_p.exists():
        logger.error(f"Input file not found: {input_path}")
        return False

    output_p.parent.mkdir(parents=True, exist_ok=True)

    # Attempt 1: Native FFmpeg command
    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(input_p),
            "-vf", "scale=640:480",
            "-pix_fmt", "yuv420p",
            "-r", "30",
            str(output_p)
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0 and output_p.exists() and output_p.stat().st_size > 0:
            logger.info(f"FFmpeg successfully converted {input_path} to {output_path}")
            return True
        else:
            logger.warning(f"FFmpeg command failed: {result.stderr}. Falling back to OpenCV.")
    except Exception as e:
        logger.warning(f"FFmpeg CLI execution failed ({e}). Falling back to OpenCV.")

    # Attempt 2: OpenCV fallback converter (if cv2 is installed)
    try:
        import cv2
        import numpy as np

        cap = cv2.VideoCapture(str(input_p))
        if not cap.isOpened():
            logger.error(f"OpenCV could not open video file: {input_path}")
            return False

        width, height = 640, 480
        fps = 30

        with open(output_p, 'wb') as f:
            header = f"YUV4MPEG2 W{width} H{height} F{fps}:1 Ip A1:1 C420\n"
            f.write(header.encode('ascii'))

            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                resized = cv2.resize(frame, (width, height))
                yuv = cv2.cvtColor(resized, cv2.COLOR_BGR2YUV_I420)
                f.write(b"FRAME\n")
                f.write(yuv.tobytes())

        cap.release()
        if output_p.exists() and output_p.stat().st_size > 0:
            logger.info(f"OpenCV successfully converted {input_path} to {output_path}")
            return True
        else:
            logger.error("OpenCV video conversion produced an empty file.")
            return False

    except ImportError:
        logger.info("OpenCV module not installed on Cloud API Server; video conversion is processed locally on desktop app client.")
        return False
    except Exception as e:
        logger.error(f"OpenCV conversion error: {str(e)}")
        return False
