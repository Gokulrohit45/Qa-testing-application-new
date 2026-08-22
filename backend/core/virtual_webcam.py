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
        "--use-fake-device-for-media-stream"
    ]

    if y4m_path and Path(y4m_path).exists():
        logger.info(f"Injecting virtual webcam stream from Y4M: {y4m_path}")
        args.append(f"--use-file-for-fake-video-capture={os.path.abspath(y4m_path)}")
    else:
        logger.info("No valid Y4M video specified; using Chromium's generated fake camera stream.")

    return args
