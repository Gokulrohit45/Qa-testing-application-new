import os
import subprocess
from pathlib import Path
from utils.logger import logger

def convert_mp4_to_y4m(input_path: str, output_path: str) -> bool:
    """
    Converts an uploaded MP4 video file to Y4M (YUV4MPEG2 640x480 @ 30fps) format
    for Chromium virtual camera injection.
    Tries imageio_ffmpeg static binary first, system ffmpeg second, OpenCV third.
    """
    input_p = Path(input_path)
    output_p = Path(output_path)

    if not input_p.exists():
        logger.error(f"Input video file not found: {input_path}")
        return False

    output_p.parent.mkdir(parents=True, exist_ok=True)

    # 1. Try imageio_ffmpeg static executable binary
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        cmd = [
            ffmpeg_exe, "-y",
            "-i", str(input_p),
            "-vf", "scale=640:480",
            "-pix_fmt", "yuv420p",
            "-r", "30",
            str(output_p)
        ]
        logger.info(f"Running imageio_ffmpeg conversion: {ffmpeg_exe}")
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0 and output_p.exists() and output_p.stat().st_size > 0:
            logger.info(f"imageio_ffmpeg successfully converted {input_path} to Y4M ({output_p.stat().st_size} bytes)")
            return True
        else:
            logger.warning(f"imageio_ffmpeg output failed: {result.stderr}")
    except Exception as e:
        logger.warning(f"imageio_ffmpeg conversion error: {e}")

    # 2. Try native system ffmpeg CLI
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
            logger.info(f"System FFmpeg successfully converted {input_path} to {output_path}")
            return True
    except Exception as e:
        logger.warning(f"System FFmpeg execution error: {e}")

    # 3. OpenCV fallback converter
    try:
        import cv2
        cap = cv2.VideoCapture(str(input_p))
        if not cap.isOpened():
            logger.error(f"OpenCV could not open video file: {input_path}")
            return False

        width, height, fps = 640, 480, 30
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
    except Exception as e:
        logger.error(f"OpenCV conversion error: {e}")

    return False
