import numpy as np
from cv2 import VideoWriter, VideoWriter_fourcc
import os

tomfile = "../../../data/20170101_11_letters.tom"

width = 1900
height = 1780
z = 2910
FPS = 30

fourcc = VideoWriter_fourcc(*'MP42')
video = VideoWriter('./letters_flythrough.avi', fourcc, float(FPS), (width, height))

f = open(tomfile, "rb")
f.seek(512, os.SEEK_SET)

for i in range(z):
    frame = np.fromfile(f, dtype=np.uint8, count=height*width).reshape((height,width))
    frame = np.stack((frame[::-1],)*3, axis=-1)
    video.write(frame)
    print(i)
video.release()