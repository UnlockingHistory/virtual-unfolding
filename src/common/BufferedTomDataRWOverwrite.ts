import { BufferedTomDataRW } from './BufferedTomDataRW';
import { BUFFER_WINDOW_SIZE, TOM_HEADER_NUM_BYTES } from './Defaults';
import { Vector3 } from 'three';
import { TomType } from './types';
import { writeTomHeaderToBuffer } from './io';
import { safeDeleteFile } from './utils';
import { openSync, writeSync, closeSync } from 'fs';

/**
 * R/W Buffered data that must be dynamically loaded
 * (too big to fit in memory at once)
 * WARNING: Will clear out previous file completely, if it exists.
 */
export class BufferedTomDataRWOverwrite extends BufferedTomDataRW {

	/**
     * @constructor
	 * @param {string} path filename where data is stored
     * @param {string} filename filename where data is stored
     */
	constructor(path: string, filename: string, type: TomType, dimensions: Vector3, numElements = 1, useNull = false, WINDOW_SIZE = BUFFER_WINDOW_SIZE) {
		const fullPath = `${path}${filename}.tom`;

		// Delete old file if it exists.
		safeDeleteFile(fullPath);
		
		// Create new file and open in write mode.
		const file = openSync(fullPath, 'w');

		// Write a header.
		const buffer = Buffer.alloc(TOM_HEADER_NUM_BYTES);
		writeTomHeaderToBuffer(fullPath, buffer, type, dimensions, numElements, useNull);
		writeSync(file, buffer, 0, buffer.length, 0);

		// Close file.
		closeSync(file);
		
		super(path, filename, WINDOW_SIZE);

		// Fill with 0 or null.
		this.clear();
	}

    /**
     * Clears all data (to either 0 or null) and save to disk.
     */
    clear() {
        // Fill buffer with null or 0.
        const clearVal = this.useNull ? this.nullVal as number : 0;
        switch (this.type) {
            case 'float32':
                for (let i = 0; i < this.buffer.length / 4; i++) {
                    this.buffer.writeFloatLE(clearVal, 4 * i);
                }
                break;
            case 'int32':
                for (let i = 0; i < this.buffer.length / 4; i++) {
                    this.buffer.writeInt32LE(clearVal, 4 * i);
                }
				break;
			case 'uint8':
                for (let i = 0; i < this.buffer.length; i++) {
                    this.buffer[i] = clearVal;
                }
                break;
            default:
                throw new Error(`Unsupported type ${this.type}.`);
        }
        // Loop through entire file and save cleared buffer.
        for (let z = this.windowSize; z < this.dim.z - this.windowSize - 1;
            z += (2 * this.windowSize) + 1) {
            this.writeToDisk(z);
        }
        // Move buffer to max z position and do one last save to ensure that
        // everything has been cleared.
        this.writeToDisk(this.dim.z - this.windowSize - 1);
        // Loop through data array and clear.
        if (this.data) {
            for (let i = 0; i < this.data.length; i++) {
                this.data[i] = clearVal;
            }
        }
        this.needsSave = false; // flag to show we need to save if we move the buffer
    }
}