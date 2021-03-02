
// Save bmp file for data.

import { writeSync, openSync, closeSync } from 'fs';

function intToBytes (num: number) {
    return new Uint8Array([
        (num & 0x000000ff),
        (num & 0x0000ff00) >> 8,
        (num & 0x00ff0000) >> 16,
        (num & 0xff000000) >> 24
    ]);
}

export function saveBMP(path: string, filename: string, data: Uint8Array, width: number, height: number, _numChannels: 3 | 1 = 3) {
	// Currently we always save out as rgb.
	// TODO: figure out how to write greyscale.
	const numChannels = 3;
	const fullPath = `${path}${filename}.bmp`;
	// Make header.
	// http://blog.paphus.com/blog/2012/08/14/write-your-own-bitmaps/
	const headerSize = 54;
	const header = new Uint8Array(headerSize);
	header[0] = 0x42;//B
	header[1] = 0x4D;//M

	// All rows must have a multiple of four bytes,
	// we may need to add padding to make this work
	let padding = 4 - ((width * numChannels) % 4);
	if (padding === 4) {
		padding = 0;
	}
	const fileSize = intToBytes((width * numChannels + padding) * height + headerSize);
	for (let i = 0; i < fileSize.length; i++) {
		header[2 + i] = fileSize[i];
	}
	header[10] = headerSize;
	header[14] = 40;
	const widthBytes = intToBytes(width);
	const heightBytes = intToBytes(height);
	for (let i = 0; i < widthBytes.length; i++) {
		header[18 + i] = widthBytes[i];
		header[22 + i] = heightBytes[i];
	}
	header[26] = 1;
	header[28] = 8 * numChannels;
	const rawDataSize = intToBytes((width * numChannels + padding) * height);
	for (let i = 0; i < rawDataSize.length; i++) {
		header[34 + i] = rawDataSize[i];
	}
	const resolution = intToBytes(2835);// Default value.module
	for (let i = 0; i < resolution.length; i++) {
		header[38 + i] = resolution[i];
		header[42 + i] = resolution[i];
	}

	const bmpFile = openSync(fullPath, 'w');

	const headerBuffer = new Buffer(headerSize);
	for (let i = 0; i < headerSize; i++) {
		headerBuffer[i] = header[i]
	}
	writeSync(bmpFile, headerBuffer, 0, headerBuffer.length, 0);
	let outBuffer = new Buffer((width * numChannels + padding) * height);
	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			for (let k = 0; k < numChannels; k++) {
				let value;
				// TODO: actually save out greyscale imgs if needed.
				if (_numChannels === 1) {
					value = data[(height - 1 - j) * (width) + i];
				} else if (_numChannels === 3) {
					value = data[_numChannels * (height - 1 - j) * (width) + _numChannels * i + k];
				} else {
					throw new Error(`Invalid numChannels for BMP: ${_numChannels}`);
				}
				outBuffer[j * (width * numChannels + padding) + numChannels * i + k] = value;
			}
		}
		for (let i = 0; i < padding; i++) {
			outBuffer[j * (width * numChannels + padding) + width * numChannels + i] = 0;
		}
	}
	writeSync(bmpFile, outBuffer, 0, outBuffer.length, headerSize);
	closeSync(bmpFile);
}
