import { Vector3 } from 'three';
import { BUFFER_WINDOW_SIZE, TOM_HEADER_NUM_BYTES } from './Defaults';
import { DeepReadonly } from 'ts-essentials';
import { TomTypedArray, TomType } from './types';
import { getTomDimensions, getTomDataType, getTomUseNull, getTomNumElements } from './io';
import { dataSizeForType, nullValForType, index3Dto1D, typeOfTypedArray } from './utils';
import { openSync, readSync, closeSync } from 'fs';

const tempArray: number[] = [];
const tempVector = new Vector3();

/**
 * Buffered data that must be dynamically loaded
 * (too big to fit in memory at once)
 * This is a Read-Only view into the file.
 */
export class BufferedTomDataR {
	dim: DeepReadonly<Vector3>;
	type: Readonly<TomType>;
	protected useNull: Readonly<boolean>;
	numElementsPerVoxel: Readonly<number>;
	protected windowSize: Readonly<number>;
	protected buffer: Buffer;
	protected file: Readonly<number>;
	protected data: TomTypedArray;

	// Precomputed values.
	protected dataSize: Readonly<number>;
	protected currentZ: number = -1;
	protected nullVal?: Readonly<number>;
	protected layerDim: Readonly<number>;
	protected bufferDim: DeepReadonly<Vector3>;

    /**
     * @constructor
	 * @param {string} path filename where data is stored
     * @param {string} filename filename where data is stored
     */
    constructor(path: string, filename: string, WINDOW_SIZE = BUFFER_WINDOW_SIZE) {
		// Open file.
		this.file = this.openFile(`${path}${filename}.tom`);
		
		// Get file params.
		this.dim = getTomDimensions(path, filename, this.file);
        this.type = getTomDataType(path, filename, this.file);
        this.useNull = getTomUseNull(path, filename, this.file);
		this.numElementsPerVoxel = getTomNumElements(path, filename, this.file);
		this.windowSize = WINDOW_SIZE;

        // Init other params.
        this.dataSize = dataSizeForType(this.type);
        if (this.useNull) {
            this.nullVal = nullValForType(this.type);
        }

        // Init buffer params.
		this.layerDim = this.dim.x * this.dim.y * this.numElementsPerVoxel;
		const dataLength = this.layerDim * ((2 * this.windowSize) + 1);
        const bufferLength = dataLength * this.dataSize;
        this.buffer = Buffer.alloc(bufferLength);
		this.bufferDim = new Vector3(this.dim.x, this.dim.y, (2 * this.windowSize) + 1);
		switch (this.type) {
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
				throw new Error(`Unsupported type ${this.type}.`);
        }

        // Load up new data.
		this.shiftWindowCenter(0);

    }

    /**
     * Opens file in read mode by default, override this in subclass.
     * @private
     * @param {string} fullPath fullPath where data is stored
     */
    protected openFile(fullPath: string) {
        return openSync(fullPath, 'r');
	}
	
	changeFile(filename: string) {
		this.close();
		this.file = this.openFile(filename);
		// Load up new data.
		this.shiftWindowCenter(0);
	}

    /**
     * Checks to see if we need to move the buffer to get data at a given z height.
     * @private
     * @param {number} z z layer being queried
     */
    protected checkBuffer(z: number) {
        if (z < 0 || z >= this.dim.z) {
            throw new Error(`Attempting to access out of bounds z index: ${z}.`);
        }
        if (Math.abs(this.currentZ - z) > this.windowSize) {
            // Need to move buffer and load more data.
            this.shiftWindowCenter(z);
        }
    }

    /**
     * Method called before buffer is reloaded, override this in subclass.
     * @private
     */
    protected beforeShift() {} /* eslint-disable-line class-methods-use-this */

    /**
     * Shifts center of buffer window if needed.
     * @private
     * @param {number} z center of buffer window
     */
    private shiftWindowCenter(z: number) {
        // Check bounds.
        const maxZ = this.dim.z - this.windowSize - 1;
        const minZ = this.windowSize;
        let nextZ;
        if (z < minZ) nextZ = minZ;
        else if (z > maxZ) nextZ = maxZ;
        else nextZ = z;

        this.manuallySetBufferCenterZ(nextZ);
    }

    private getCurrentZ() {
        return this.currentZ;
    }

    protected manuallySetBufferCenterZ(z: number) {
        // If already at appropriate z, ignore.
        if (z === this.currentZ) return;

        // In case this is a BufferedVolDataRW object, we need to check if the
        // current buffer should be saved before moving window.
        this.beforeShift();

        // Store current z height.
        this.currentZ = z;

        // Calculate data offset in bytes.
        const offset = (this.currentZ - this.windowSize) * this.layerDim * this.dataSize;
        // Move buffer.
        this.moveBuffer(offset);
    }

    /**
     * Moves buffer window to a new position.
     * @private
     * @param {number} offset data offset of new buffer window in bytes
     */
    private moveBuffer(offset: number) {
        // Check that we aren't trying to access data out of bounds of the current file.
        let bufferFillOffset = 0;
        let bufferFillLength = this.buffer.length;
        // check that we're not trying to grab bytes from before beginning of file.
        let fileOffset = offset;
        if (fileOffset < 0) {
			bufferFillOffset = Math.abs(fileOffset);
			bufferFillLength = this.buffer.length - bufferFillOffset;
			fileOffset = 0;
        }
        // Check that we're not grabbing data past the end of the file.
        const totalFileSizeInBytes = this.layerDim * this.dim.z * this.dataSize;
        if (fileOffset + bufferFillLength > totalFileSizeInBytes) {
            bufferFillLength = totalFileSizeInBytes - fileOffset;
        }

        // Load data - note, we could optimize this further if there is a partial overlap
        // with the last loaded buffer.
        readSync(this.file, this.buffer, bufferFillOffset, bufferFillLength, TOM_HEADER_NUM_BYTES + fileOffset);

        // Fill out of bounds sections with nulls.
        for (let i = 0; i < bufferFillOffset / this.dataSize; i++) {
            this.data[i] = this.useNull ? this.nullVal as number : 0;
        }
        for (let i = (bufferFillOffset + bufferFillLength) / this.dataSize; i < this.data.length; i++) {
            this.data[i] = this.useNull ? this.nullVal as number : 0;
        }
    }

    /**
     * Returns value(s) corresponding to voxel.
     * @param {number} x x position
     * @param {number} y y position
     * @param {number} z z position
	 * @param {number} array optional array to pass in (to limit array allocations)
     * @returns {number|array|null} value(s) at voxel or null
     */
	get(x: number, y: number, z: number): number | null;
	get(x: number, y: number, z: number, array: number[]): number[] | null;
    get(x: number, y: number, z: number, array?: number[]): number | number[] | null {
		// Load new buffer if needed.
        this.checkBuffer(z);
		// Convert 3D index to 1D index.
		tempVector.set(x, y, z - (this.currentZ - this.windowSize));
        const index = this.numElementsPerVoxel *
            index3Dto1D(tempVector, this.bufferDim);

        // If this voxel contains only one number.
        if (this.numElementsPerVoxel === 1) {
            // Get value at index.
            const val = this.data[index];
            // Convert to null if needed.
            if (this.useNull && val === this.nullVal) return null;
            return val;
        }
		// Otherwise, return an array of values or null.
		if (array === undefined) {
			throw new Error('No array passed to BufferedTomData.get().');
		}
		// Get first element.
		array.length = 0;
        array.push(this.data[index]);
        // Return null if first element is null.
        if (this.useNull && array[0] === this.nullVal) return null;
        // Keep filling array until we hit a null.
        for (let i = 1; i < this.numElementsPerVoxel; i++) {
            const nextVal = this.data[index + i];
            if (this.useNull && nextVal === this.nullVal) return array;
            array.push(nextVal);
        }
        return array;
    }

    /**
     * Returns Vector3 corresponding to voxel.
     * @param {Integer} x x position
     * @param {Integer} y y position
     * @param {Integer} z z position
     * @returns {Vector3|null} Vector3 at voxel or null
     */
    getVector3(x: number, y: number, z: number, v: Vector3): Vector3 | null {
        if (this.numElementsPerVoxel !== 3) {
            throw new Error('Must be exactly three elements per voxel to call getVector3().');
        }
        // Get data for voxel.
        const data = this.get(x, y, z, tempArray) as number[] | null;
        if (data === null) return null;
        // Convert from array to Vector3.
        if (data.length !== 3) {
            throw new Error(`Voxel at position ${x}, ${y}, ${z} contains less than three elements.`);
        }
        return v.set(data[0], data[1], data[2]);
    }

    /**
     * Returns TypedArray of data at given z layer.
     * @param {number} z z layer being queried
     * @returns {TomTypedArray} typed array containing z layer data
     */
	getLayer(z: number, array: Uint8Array): Uint8Array;
	getLayer(z: number, array: Float32Array): Float32Array;
	getLayer(z: number, array: Uint8Array): Uint8Array;
	getLayer(z: number, array: Int32Array): Int32Array;
    getLayer(z: number, array: TomTypedArray) {
		// Check array.
		if (array.length !== this.layerDim) {
			throw new Error(`Incompatible array of length ${array.length}, for layer size of length ${this.layerDim}.`);
		}
		if (typeOfTypedArray(array) !== this.type) {
			throw new Error(`Incompatible array of type ${typeOfTypedArray(array)}, for data of type ${this.type}.`);
		}
        // Load new buffer if needed.
        this.checkBuffer(z);
		// Convert 3D index to 1D index.
		tempVector.set(0, 0, z - (this.currentZ - this.windowSize));
        const index = this.numElementsPerVoxel *
            index3Dto1D(tempVector, this.bufferDim);
		// copy data into array.
		for (let i = 0; i < this.layerDim; i++) {
            array[i] = this.data[index + i];
        }
        return array;
    }

    getData(z: number) {
		this.manuallySetBufferCenterZ(z);
        return this.data;
    }

    getArraySize() {
        return this.data.length;
    }

    /**
     * Closes file, clears all memory for garbage collection.
     */
    close() {
        closeSync(this.file);
    }
}
