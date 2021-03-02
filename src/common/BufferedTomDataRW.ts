import { BufferedTomDataR } from './BufferedTomDataR';
import { TOM_HEADER_NUM_BYTES } from './Defaults';
import { Vector3 } from 'three';
import { TomTypedArray } from './types';
import { index3Dto1D, isArray } from './utils';
import { openSync, writeSync } from 'fs';

const tempVector = new Vector3();

/**
 * R/W Buffered data that must be dynamically loaded
 * (too big to fit in memory at once)
 * WARNING: this has the potential to overwrite data in current file.
 */
export class BufferedTomDataRW extends BufferedTomDataR {
	protected needsSave: boolean = false;

    /**
     * Opens file as read/write, see fs docs for info on system flags:
     * https://nodejs.org/api/fs.html#fs_file_system_flags
     * @private
     * @param {String} fullPath
     */
    protected openFile(fullPath: string) {
		// Open file in read/write mode.
		return openSync(fullPath, 'r+');
    }

    /**
     * Saves data if needed, called before shifting buffer window.
     * @private
     */
    protected beforeShift() {
        if (!this.needsSave) return;
        this.save();
    }

    /**
     * Saves current buffered data.
     * @private
     */
    protected save() {
        // Write data to buffer.
        switch (this.type) {
            case 'float32':
                for (let i = 0; i < this.data.length; i++) {
                    this.buffer.writeFloatLE(this.data[i], 4 * i);
                }
                break;
            case 'int32':
                for (let i = 0; i < this.data.length; i++) {
                    this.buffer.writeInt32LE(this.data[i], 4 * i);
                }
				break;
			case 'uint32':
                for (let i = 0; i < this.data.length; i++) {
                    this.buffer.writeUInt32LE(this.data[i], 4 * i);
                }
                break;
            case 'uint8':
                for (let i = 0; i < this.data.length; i++) {
                    this.buffer[i] = this.data[i];
                }
                break;
            default:
                throw new Error(`Unknown type ${this.type}.`);
        }
        // Write buffer to
        this.writeToDisk(this.currentZ);
        this.needsSave = false;
    }

    /**
     * Write operation.
     * @private
     */
    protected writeToDisk(z: number) {
		// Save buffer to disk.
		// TODO: this is wrong.
        const offset = (z - this.windowSize) * this.layerDim * this.dataSize;
        writeSync(this.file, this.buffer, 0, this.buffer.length, offset + TOM_HEADER_NUM_BYTES);
        // fs.fsyncSync(this._file);
	}
	
	manuallySetNeedsSave() {
		this.needsSave = true;
	}

    /**
     * Sets value(s) or null at voxel.
     * @param {number} x x position
     * @param {number} y y position
     * @param {number} z z position
     * @param {number|array|null} val value(s) or null to set
     */
    set(x: number, y: number, z: number, val: null | number | number[]) {
        // Move buffer if needed.
        this.checkBuffer(z);
		// Calc 1D index from 3D position.
		tempVector.set(x, y, z - (this.currentZ - this.windowSize));
        const index = this.numElementsPerVoxel *
            index3Dto1D(tempVector, this.bufferDim);
        if (val === null) {
            if (this.useNull) {
                for (let i = 0; i < this.numElementsPerVoxel; i++) {
                    this.data[index + i] = this.nullVal as number;
                }
            } else {
				throw new Error('Null value not valid for this BufferedVolumetricDataRW.');
			}
        } else if (this.numElementsPerVoxel === 1) {
			if (isArray(val)){
				throw new Error('BufferedVolumetricDataRW.set() val must be number or null for numElementsPerVox === 1.');
			}
            this.data[index] = val as number;
        } else {
			if (!isArray(val)){
				throw new Error('BufferedVolumetricDataRW.set() val must be array or null for numElementsPerVox > 1.');
			}
			val = val as number[];
            if (this.numElementsPerVoxel !== val.length && !this.useNull) {
                // If not using nulls, numElementsPerVox must equal val.length.
                throw new Error('BufferedVolumetricDataRW.set() val param must be same length as numElementsPerVox.');
            }
            if (this.numElementsPerVoxel < val.length) {
                throw new Error('BufferedVolumetricDataRW.set() val param is too long.');
            }
            for (let i = 0; i < this.numElementsPerVoxel; i++) {
                // Fill this._data with val[i] or null.
                this.data[index + i] = (i < val.length) ? val[i] : this.nullVal as number;
            }
        }
        // Update needs save flag.
        this.needsSave = true;
    }

    /**
     * Sets Vector3 or null at voxel.
     * @param {number} x x position
     * @param {number} y y position
     * @param {number} z z position
     * @param {Vector3|null} val vector3 or null
     */
    setVector3(x: number, y: number, z: number, val: Vector3) {
        if (this.numElementsPerVoxel !== 3) {
            throw new Error('Must be exactly three elements per voxel to call setVector3().');
        }
        // Move buffer if needed.
        this.checkBuffer(z);
		// Set data.
		tempVector.set(x, y, z - (this.currentZ - this.windowSize));
        const index = this.numElementsPerVoxel *
            index3Dto1D(tempVector, this.bufferDim);
        if (val === null) {
            if (this.useNull) {
                this.data[index] = this.nullVal as number;
                this.data[index + 1] = this.nullVal as number;
                this.data[index + 2] = this.nullVal as number;
            } else throw new Error('Null value not valid for this BufferedVolumetricDataRW.');
        } else {
            this.data[index] = val.x;
            this.data[index + 1] = val.y;
            this.data[index + 2] = val.z;
        }
        // Update needs save flag.
        this.needsSave = true;
    }

    /**
     * Sets entire z layer of data.
     * @param {number} z z position
     * @param {TomTypedArray} val data
     */
    setLayer(z: number, val: TomTypedArray) {
        if (this.layerDim !== val.length) {
            throw new Error(`Invalid layer size: ${this.numElementsPerVoxel * this.dim.x * this.dim.y}, ${val.length}`);
        }
        // Move buffer if needed.
        this.checkBuffer(z);
		// Load new data into this._data.
		tempVector.set(0, 0, z - (this.currentZ - this.windowSize));
        const index = this.numElementsPerVoxel *
            index3Dto1D(tempVector, this.bufferDim);
        for (let i = 0; i < this.layerDim; i++) {
            this.data[index + i] = val[i];
        }
        // Update needs save flag.
        this.needsSave = true;
    }

    protected setData(val: Float32Array | Uint8Array | Int32Array, startingIndex = 0, endingIndex = val.length) {
        if (this.data.length !== val.length) {
            throw new Error(`Invalid buffer size: ${val.length}`);
        }
        if (startingIndex < 0 || startingIndex >= val.length || startingIndex > endingIndex) {
            throw new Error(`Invalid startingIndex: ${startingIndex}`);
        }
        if (endingIndex < 0 || endingIndex >= val.length) {
            throw new Error(`Invalid endingIndex: ${endingIndex}`);
        }
        // Load new data into this._data.
        for (let i = startingIndex; i < endingIndex; i++) {
            this.data[i] = val[i];
        }
        // Update needs save flag.
        this.needsSave = true;
    }

    /**
     * Saves, close files, clears all memory for garbage collection.
     */
    close() {
        if (this.needsSave) this.save();
        super.close();
    }
}