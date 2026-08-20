import os
from pathlib import Path
from utils.logger import logger

def get_chromium_camera_args(y4m_path: str = None):
    """
    Returns Playwright Chromium launch arguments for virtual camera injection
    and SSL bypass.
    """
    args = [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--ignore-certificate-errors",
        "--allow-running-insecure-content",
        "--unsafely-treat-insecure-origin-as-secure=http://officehub360.vtabsquare.com,http://localhost:5000,http://127.0.0.1:5000",
        "--disable-web-security"
    ]

    if y4m_path and Path(y4m_path).exists():
        logger.info(f"Injecting virtual webcam stream from Y4M: {y4m_path}")
        args.append(f"--use-file-for-fake-video-capture={os.path.abspath(y4m_path)}")
    else:
        logger.info("No Y4M video specified or file missing; using default Chromium fake camera stream pattern.")

    return args
