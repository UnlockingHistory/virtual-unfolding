import { readBin, getBinUseNull, getBinNumElements, writeBin, writeBinHeader, readDataAsType } from './io';
import { isPositiveInteger, typeOfTypedArray, isNonNegativeInteger, nullValForType, isArray, dataSizeForType } from './utils';
import { Vector3, Vector2 } from 'three';
import { Type, TypedArray } from './types';
import { closeSync, openSync } from 'fs';

const tempArray: number[] = [];
const GROW_INCREMENT = 1000000;

/**
 * Typed array that can grow
 */
export default class MutableTypedArray {

	private useNull: Readonly<boolean>;
	private nullVal?: Readonly<number>;
	numElementsPerIndex: Readonly<number>;
	type: Readonly<Type>;
	private data: TypedArray;
	private length: number;
	
	static initFromFile(path: string, filename: string) {
		const file = openSync(`${path}${filename}.bin`, 'r');
		const useNull = getBinUseNull(path, filename, file);
		const numElementsPerIndex = getBinNumElements(path, filename, file);
		const data = readBin(path, filename, file);
		closeSync(file);
		return new MutableTypedArray(data, useNull, numElementsPerIndex); 
	}

    /**
     * @constructor
     * @param {TypedArray} data initial data.
     * @param {boolean} useNull flag telling if this data contains nulls
     * @param {number} numElementsPerIndex number of elements that should be grouped together
	 * @param {number} length number of indices in data (only used in clone() operations)
     */
    constructor(data: TypedArray, useNull: boolean, numElementsPerIndex = 1, length = data.length / numElementsPerIndex) {
        // Check input params.
        if (!isPositiveInteger(numElementsPerIndex)) {
            throw new Error('numElementsPerVox for MutableTypedArray must be a positive integer.');
        }

        // Store input params.
        this.numElementsPerIndex = numElementsPerIndex;
        this.type = typeOfTypedArray(data);
		this.useNull = useNull;
		this.data = data;//.slice(0, length * numElementsPerIndex);// Make copy of data.

        // Init other params.
        this.length = length;
        if (!isNonNegativeInteger(this.length)) {
            throw new Error('Input data length of MutableTypedArray is not integer multiple of numElementsPerIndex.');
        }
        if (this.useNull) {
            this.nullVal = nullValForType(this.type);
        }
    }

    /**
     * Clears all data (to either 0 or null).
     */
    clear() {
        let clearVal = 0;
        if (this.useNull) {
            clearVal = this.nullVal!;
        }
        for (let i = 0; i < this.data.length; i++) {
            this.data[i] = clearVal;
        }
    }

    /**
     * Returns 'length' of array.
     * Note that each entry of a MutableTypedArray may contain multiple values.
     * @returns {number} number of entries in MutableTypedArray
     */
    getLength() {
        return this.length;
	}

    /**
     * Returns value(s) or null at index.
     * @param {number} index lookup index
     * @returns {number|array|null} value(s) stored at given index or null
     */
	get(index: number): number | null;
	get(index: number, array: number[]): number[] | null
    get(index: number, array?: number[]) {
        // Check input param.
        if (index < 0 || index >= this.length) {
            throw new Error(`Index out of bounds: ${index}`);
        }

        // Get first element stored at index.
        const firstVal = this.data[this.numElementsPerIndex * index];
		if (this.useNull && firstVal === this.nullVal) return null;
		
        // If only one element per index, return a single number.
        if (this.numElementsPerIndex === 1) {
            return firstVal;
		}
		// Otherwise, return an array of values or null.
		if (array === undefined) {
			throw new Error('No array passed to MutableTypedArray.get().');
		}
		// Else, add vals to array until a null value or numElementsPerIndex is reached.
		array.length = 0;
		array.push(firstVal);
        for (let i = 1; i < this.numElementsPerIndex; i++) {
            const val = this.data[(this.numElementsPerIndex * index) + i];
            if (this.useNull && val === this.nullVal) return array;
            array.push(val);
        }
        return array;
    }

    /**
     * Returns Vector3 at index.
     * @param {number} index lookup index
     * @returns {Vector3} Vector3 stored at given index or null
     */
    getVector3(index: number, v: Vector3) {
        // Check input param.
        if (this.numElementsPerIndex !== 3) {
            throw new Error('Cannot call getVector3() on MutableTypedArray with numElementsPerIndex != 3.');
		}
	
        // Call standard get function.
        const data = this.get(index, tempArray);
		if (data === null) return null;
		
        // Return array as Vector3.
        if (data.length !== 3) {
			throw new Error(`Voxel at index ${index} contains less than three elements.`);
		}
		return v.set(data[0], data[1], data[2]);
		// if (v) return v.set(data[0], data[1], data[2]);
		// return new Vector3(data[0], data[1], data[2]);
    }

    /**
     * Returns Vector2 at index.
     * @param {number} index lookup index
     * @returns {Vector2} Vector2 stored at given index or null
     */
    getVector2(index: number, v: Vector2) {
        // Check input param.
        if (this.numElementsPerIndex !== 2) {
            throw new Error('Cannot call getVector2() on MutableTypedArray with numElementsPerIndex != 2.');
		}
		
        // Call standard get function.
        const data = this.get(index, tempArray);
		if (data === null) return null;
		
        // Return array as Vector2.
        if (data.length !== 2) {
			throw new Error(`Voxel at index ${index} contains less than two elements.`);
		}
		return v.set(data[0], data[1]);
		// if (v) return v.set(data[0], data[1]);
		// return new Vector2(data[0], data[1]);
    }

    /**
     * Sets data at index.
     * @param {number} index lookup index
     * @param {number|array|null} val value(s) or null
     */
    set(index: number, val: number | number[] | null) {
        if (index < 0 || index >= this.length) {
            throw new Error(`Index out of bounds: ${index}`);
		}
		if (val === null) {
            if (this.useNull) {
                for (let i = 0; i < this.numElementsPerIndex; i++) {
                    this.data[index * this.numElementsPerIndex + i] = this.nullVal as number;
                }
            } else {
				throw new Error('Null value not valid for this MutableTypedArray.');
			}
        } else if (this.numElementsPerIndex === 1) {
			if (isArray(val)){
				throw new Error('MutableTypedArray.set() val must be number or null for numElementsPerIndex === 1.');
			}
            this.data[index] = val as number;
        } else {
			if (!isArray(val)){
				throw new Error('MutableTypedArray.set() val must be array or null for numElementsPerIndex > 1.');
			}
			val = val as number[];
            if (this.numElementsPerIndex !== val.length && !this.useNull) {
                // If not using nulls, numElementsPerIndex must equal val.length.
                throw new Error('MutableTypedArray.set() val param must be same length as numElementsPerIndex.');
            }
            if (this.numElementsPerIndex < val.length) {
                throw new Error('MutableTypedArray.set() val param is too long.');
            }
            for (let i = 0; i < this.numElementsPerIndex; i++) {
                // Fill this._data with val[i] or null.
                this.data[this.numElementsPerIndex * index + i] = (i < val.length) ? val[i] : this.nullVal as number;
            }
        }
	}
	
	/**
     * Sets Vector3 at index.
     * @param {number} index lookup index
     * @param {Vector3|null} val Vector3 or null
     */
    setVector3(index: number, val: Vector3 | null) {
        // Check input params.
        if (this.numElementsPerIndex !== 3) {
            throw new Error('Must be exactly three elements per index to call setVector3().');
		}
        if (index < 0 || index >= this.length) {
            throw new Error(`Out of bound index ${index} for MutableTypedArray of length ${this.length}.`);
        }
		
        // Set data.
		if (val === null) {
            if (this.useNull) {
                this.data[3 * index] = this.nullVal as number;
                this.data[3 * index + 1] = this.nullVal as number;
                this.data[3 * index + 2] = this.nullVal as number;
            } else throw new Error('Null value not valid for this MutableTypedArray.');
        } else {
            this.data[3 * index] = val.x;
            this.data[3 * index + 1] = val.y;
            this.data[3 * index + 2] = val.z;
        }
    }

    /**
     * Sets Vector2 at index.
     * @param {number} index lookup index
     * @param {Vector2|null} val Vector3 or null
     */
    setVector2(index: number, val: Vector2) {
        // Check input params.
        if (this.numElementsPerIndex !== 2) {
            throw new Error('Must be exactly two elements per index to call setVector2().');
        }
        if (index < 0 || index >= this.length) {
            throw new Error(`Out of bound index ${index} for MutableTypedArray of length ${this.length}.`);
        }

        // Set data.
		if (val === null) {
            if (this.useNull) {
                this.data[2 * index] = this.nullVal as number;
                this.data[2 * index + 1] = this.nullVal as number;
            } else throw new Error('Null value not valid for this MutableTypedArray.');
        } else {
            this.data[2 * index] = val.x;
            this.data[2 * index + 1] = val.y;
        }
    }

    // /**
    //  * Sets large window of data at once.
    //  * @param {TypedArray} data new data
    //  * @param {number} [startIndex] starting index to set data
    //  * @param {number} [numIndices] number of indices to set
    //  */
    // setData(data, startIndex, numIndices) {
    //     // Set default params.
    //     const start = startIndex || 0;
    //     const length = numIndices || data.length / this.numElementsPerIndex;
    //     // Check input params.
    //     if (length * this.numElementsPerIndex > data.length) {
    //         throw new Error('setData() error, data array is not long enough for numIndices.');
    //     }
    //     // Set data.
    //     // this._data.set(data, start * this.numElementsPerIndex);
    //     const num = length * this.numElementsPerIndex;
    //     for (let i = 0; i < num; i++) {
    //         this._data[(start * this.numElementsPerIndex) + i] = data[i];
    //     }
	// }
	
	private growDataArray() {
		if (this.data.length === this.length * this.numElementsPerIndex) {
            // Grow data array by adding a million extra entries.
            const length = this.numElementsPerIndex * (this.length + GROW_INCREMENT);
            // Check that we haven't exceed a max.
            // TODO: handle these cases.
            if (length * dataSizeForType(this.type) > (2 ** 31) - 1) {
                throw new Error('Mutable typed array is too long.');
            }
            let newData;
            switch (this.type) {
                case 'uint8':
                    newData = new Uint8Array(length);
                    break;
                case 'int16':
                    newData = new Int16Array(length);
                    break;
                case 'uint16':
                    newData = new Uint16Array(length);
                    break;
                case 'int32':
                    newData = new Int32Array(length);
                    break;
                case 'uint32':
                    newData = new Uint32Array(length);
                    break;
                case 'float32':
                    newData = new Float32Array(length);
                    break;
                default:
                    throw new Error(`Unknown type ${this.type}.`);
            }
            // Populate new array with old data.
            for (let i = 0, length = this.length * this.numElementsPerIndex; i < length; i++) {
                newData[i] = this.data[i];
            }
            // Fill the rest will null, if needed.
            if (this.useNull) {
                for (let i = this.length * this.numElementsPerIndex, length = newData.length; i < length; i++) {
                    newData[i] = this.nullVal!;
                }
            }
            // Set this._data.
            this.data = newData;
        }
	}

    /**
     * Pushes data to end of array.
     * @param {number|array|null} val value(s) or null to push.
     */
    push(val: number[] | number | null) {
		this.growDataArray();

		// Get index.
		const index = this.length;
		
        // Increment length.
		this.length += 1;
		
        // Set value(s) or null with regular setter.
        this.set(index, val);
	}
	
	/**
     * Pushes Vector3 to end of array.
     * @param {Vector3|null} vec Vector3 or null
     */
    pushVector3(val: Vector3 | null) {
		this.growDataArray();

		// Get index.
		const index = this.length;
		
        // Increment length.
		this.length += 1;
		
        // Set value(s) or null with regular setter.
        this.setVector3(index, val);
    }

    /**
     * Pushes Vector2 to end of array.
     * @param {Vector2|null} vec Vector3 or null
     */
    pushVector2(val: Vector2) {
		this.growDataArray();

		// Get index.
		const index = this.length;
		
        // Increment length.
		this.length += 1;
		
        // Set value(s) or null with regular setter.
        this.setVector2(index, val);
    }

    forEach(callback: (val: number | number[] | null, index: number) => void) {
        for (let i = 0, length = this.length; i < length; i++) {
            callback(this.get(i), i);
        }
	}
	
	forEachVector3(callback: (val: Vector3 | null, index: number) => void) {
		const v = new Vector3();
        for (let i = 0, length = this.length; i < length; i++) {
            callback(this.getVector3(i, v), i);
        }
    }

    forEachVector2(callback: (val: Vector2 | null, index: number) => void) {
		const v = new Vector2();
        for (let i = 0, length = this.length; i < length; i++) {
            callback(this.getVector2(i, v), i);
        }
    }

    // /**
    //  * Returns a copy of a portion of the this._data array.
    //  * @param {number} [startIndex=0] starting index to copy from
    //  * @param {number} [endIndex=this.length] ending index to copy from
    //  */
    // getData(startIndex, endIndex) {
    //     // Set default params, if necessary.
    //     const start = startIndex || 0;
    //     const end = endIndex || this.length;
    //     // Check params.
    //     if (!utils.isNonNegativeInteger(start)) {
    //         throw new Error(`Invalid startIndex: ${start}`);
    //     }
    //     if (start >= end) {
    //         throw new Error('startIndex must be strictly less than endIndex.');
    //     }
    //     if (!utils.isInteger(end) || end > this.length) {
    //         throw new Error(`Invalid endIndex: ${end}`);
    //     }
    //     return this._data.slice(start * this.numElementsPerIndex, end * this.numElementsPerIndex);
    // }

    /**
     * Returns this.data, this is called externally to avoid unecessary copies.
     */
    getData() {
        return this.data;
    }

    /**
     * Saves data as a .vol file.
     * @param {string} path path for save
     * @param {*} filename filename for save
     */
    saveAsBin(path: string, filename: string) {
		writeBin(path, filename, this.data, this.numElementsPerIndex, this.useNull, this.getLength() * this.numElementsPerIndex);
    }

    /**
     * Opens a new file and saves header.
     * @param {string} path path for save
     * @param {*} filename filename for save
     * @returns {integer} file pointer
     */
    saveHeader(path: string, filename: string) {
		return writeBinHeader(path, filename, this.data, this.numElementsPerIndex, this.useNull, this.getLength() * this.numElementsPerIndex);
    }

    /**
     * Clears all memory for garbage collection.
     */
    destroy() {
        // Clear properties for garbage collection.
        // delete this.data;
    }

    /**
     * Returns a deep copy of current instance.
     * @returns {MutableTypedArray} clone of current instance
     */
    clone() {
        return new MutableTypedArray(this.data, this.useNull, this.numElementsPerIndex, this.length);
    }

    // TODO: remove this.
    convertToVector2() {
        if (this.numElementsPerIndex !== 3 || this.type !== 'float32') {
            throw new Error('bad Vector 3 array');
        }
        const data = new Float32Array(this.length * 2);
        for (let i = 0; i < this.length; i++) {
            data[2 * i] = this.data[3 * i];
            data[2 * i + 1] = this.data[3 * i + 2];
        }
        return new MutableTypedArray(data, this.useNull, 2);
    }
    // TODO: remove this.
    static initFromVol(path: string, filename: string, type: Type, useNull: boolean, numElementsPerIndex: number) {
		const fullPath = `${path}${filename}.vol`;
        const file = openSync(fullPath, 'r');
        const data = readDataAsType(fullPath, type, 0, undefined, file);
		closeSync(file);
		return new MutableTypedArray(data, useNull, numElementsPerIndex); 
    }
}