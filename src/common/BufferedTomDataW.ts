import { Vector3 } from 'three';
import { TOM_HEADER_NUM_BYTES } from './Defaults';
import { DeepReadonly } from 'ts-essentials';
import { TomTypedArray, TomType } from './types';
import { writeTomHeaderToBuffer } from './io';
import { dataSizeForType, safeDeleteFile } from './utils';
import { openSync, closeSync, writeSync } from 'fs';

const headerBuffer = Buffer.alloc(TOM_HEADER_NUM_BYTES);

/**
 * Buffered data that must be dynamically loaded
 * (too big to fit in memory at once)
 * This is a Read-Only view into the file.
 */
export class BufferedTomDataW {
	// File parameters
	protected dim: DeepReadonly<Vector3>;
	protected type: Readonly<TomType>;
	protected useNull: Readonly<boolean>;
	protected numElementsPerVoxel: Readonly<number>;

	protected buffer: Buffer;
	protected file: Readonly<number>;
	protected data: TomTypedArray;

	// Precomputed values.
	protected dataSize: Readonly<number>;
	protected layerDim: Readonly<number>;

    /**
     * @constructor
	 * @param {string} path filename where data is stored
     * @param {string} filename filename where data is stored
     */
    constructor(path: string, filename: string, type: TomType, dimensions: Vector3, numElements = 1, useNull = false) {

		const fullPath = `${path}${filename}.tom`;

		// Delete old file if it exists.
		safeDeleteFile(fullPath);

		// Create new file and open in write mode.
		this.file = this.openFile(fullPath);

		// Save params.
		this.type = type;
		this.dim = dimensions;
		this.numElementsPerVoxel = numElements;
		this.useNull = useNull;

		// Write a header.
		writeTomHeaderToBuffer(fullPath, headerBuffer, type, dimensions, numElements, useNull);
		writeSync(this.file, headerBuffer, 0, headerBuffer.length, 0);

        // Init other params.
        this.dataSize = dataSizeForType(type);
		this.layerDim = dimensions.x * dimensions.y * numElements;
        this.buffer = Buffer.alloc(this.layerDim * this.dataSize);
		switch (type) {
            case 'uint8':
                this.data = new Uint8Array(this.buffer.buffer);
                break;
            case 'float32':
                this.data = new Float32Array(this.buffer.buffer);
                break;
            case 'int32':
                this.data = new Int32Array(this.buffer.buffer);
				break;
			case 'uint32':
                this.data = new Uint32Array(this.buffer.buffer);
                break;
            default:
				throw new Error(`Unsupported type ${type}.`);
        }
	}

	/**
     * Opens file in write mode by default.
     * @private
     * @param {string} fullPath fullPath where data is stored
     */
    protected openFile(fullPath: string) {
		// Would be better to open in append mode 'a', but not supported by all systems.
		return openSync(fullPath, 'w');
	}
	
	changeFile(fullPath: string) {
		this.close();
		this.file = this.openFile(fullPath);
		// Because we are in write mode and not append mode, we must rewrite the header.
		// Write a header.
		writeTomHeaderToBuffer(fullPath, headerBuffer, this.type, this.dim, this.numElementsPerVoxel, this.useNull);
		writeSync(this.file, headerBuffer, 0, headerBuffer.length, 0);
	}

    writeLayer(z: number) {
		// Save buffer to disk.
		const offset = z * this.layerDim * this.dataSize;
        writeSync(this.file, this.buffer, 0, this.buffer.length, offset + TOM_HEADER_NUM_BYTES);
	}

	getData() {
		return this.data;
	}

    /**
     * Closes file, clears all memory for garbage collection.
     */
    close() {
        closeSync(this.file);
    }
}
