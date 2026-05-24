import cv2
import numpy as np

# Let's import the OCR service
from src.backend.services.video_lpr_service import get_video_ocr_service

svc = get_video_ocr_service()
img = np.zeros((100, 200, 3), dtype=np.uint8)
res, conf = svc.recognize(img)
print("Recognize dummy:", res)
