const fs = require('fs');
const utils = require('./utils');
const Vector3 = require('../../dependencies/Vector3');

/**
 * Buffered data that can be loaded all at once.
 */
class VolumetricData {
    /**
     * @constructor
     * @param {Vector3} dim - dimensions of data
     * @param {String} type - data type
     * @param {Integer} [numElementsPerVox = 1] - number of elements stored in each voxel
     * (eg three elements may be stored for a 3D vector field)
     * @param {Boolean} useNull - flag if we should be checking for nullVal
     */
    constructor(dim, type, useNull, numElementsPerVox = 1) {
        if (dim === undefined || type === undefined || useNull === undefined) {
            throw new Error('Missing initialization param for BufferedVolumetricData.');
        }
        if (dim.x <= 0 || dim.y <= 0 || dim.z <= 0 || !utils.isInteger(dim.x) ||
            !utils.isInteger(dim.y) || !utils.isInteger(dim.z)) throw new Error('Dimensions for BufferedVolumetricData must be positive integers.');
        if (numElementsPerVox <= 0 || !utils.isInteger(numElementsPerVox)) throw new Error('numElementsPerVox for BufferedVolumetricData must be a positive integer.');

        this._dim = dim;
        this._numElementsPerVox = numElementsPerVox;
        this._type = type.toLowerCase();

        this._arraydimZ = Math.floor((Math.pow(2, 31) - 1) / (this._numElementsPerVox * utils.dataSizeForType(this._type) * this._dim.x * this._dim.y));
        this._numArrays = Math.ceil(this._dim.z / this._arraydimZ);// we need to split data into multiple arrays to avoid hitting js limit on array size

        if (this._arraydimZ * this._dim.x * this._dim.y * this._numElementsPerVox
            * utils.dataSizeForType(this._type) > (Math.pow(2, 31) - 1)) {
            throw new Error('Something went wrong in this._numArrays calc.');
        }
        this._adjustedDim = new Vector3(dim.x, dim.y, this._arraydimZ);

        this._dataOffset = 0;
        this._dataSize = utils.dataSizeForType(type);
        this._useNull = useNull;
        if (this._useNull) this._nullVal = utils.nullValForType(type);

        this._initData();
    }

    _initData() {
        this._data = [];
        const size = this._adjustedDim.x * this._adjustedDim.y * this._adjustedDim.z * this._numElementsPerVox;
        switch (this._type) {
            case 'uint8':
                for (let i = 0; i < this._numArrays; i++) {
                    this._data.push(new Uint8Array(size));
                }
                break;
            case 'float32':
                for (let i = 0; i < this._numArrays; i++) {
                    this._data.push(new Float32Array(size));
                }
                break;
            case 'int32':
                for (let i = 0; i < this._numArrays; i++) {
                    this._data.push(new Int32Array(size));
                }
                break;
            default:
                throw new Error(`Unknown type ${this._type}.`);
        }
        if (this._useNull) {
            // Typed arrays are filled with zeros by default, fill with nulls if necessary.
            this.clear();
        }
    }

    _getArrayIndicesForZ(x, y, z) {
        const arrayNum = Math.floor(z / this._arraydimZ);
        if (arrayNum > this._numArrays - 1) {
            throw new Error(`Z index ${z} beyond bounds of array.`);
        }
        const adjustedZ = z - arrayNum * this._arraydimZ;
        const index = this._numElementsPerVox * utils.index3Dto1D(x, y, adjustedZ, this._adjustedDim);
        // Math.floor((Math.pow(2, 31) - 1) / utils.dataSizeForType(this._type))
        if (index > 2147483647 / utils.dataSizeForType(this._type)) {
            throw new Error(`Array index ${index} beyond bounds of max Typed Array size.`);
        }
        return [arrayNum, index];
    }

    /**
     * set data at voxel
     * @param {Integer} x - x position
     * @param {Integer} y - y position
     * @param {Integer} z - z position
     * @param {Number | null} val - data
     */
    set(x, y, z, val) {
        if (this._numElementsPerVox !== 1) throw new Error('Must be exactly 1 element per voxel to call set().');
        const [arrayNum, index] = this._getArrayIndicesForZ(x, y, z);
        if (val === null) {
            if (this._useNull) this._data[arrayNum][index] = this._nullVal;
            else throw new Error('Null value not valid for this VolumetricData.');
        } else {
            this._data[arrayNum][index] = val;
        }
    }

    /**
     * set array of elements corresponding to voxel
     * @param {Integer} x - x position
     * @param {Integer} y - y position
     * @param {Integer} z - z position
     * @param {Array} val - array of values to set
     */
    setValues(x, y, z, val) {
        if (this._numElementsPerVox === 1) throw new Error('Must be more than 1 element per voxel to call setValues().');
        const [arrayNum, index] = this._getArrayIndicesForZ(x, y, z);
        if (val === null) {
            if (this._useNull) {
                for (let i = 0; i < this._numElementsPerVox; i++) {
                    this._data[arrayNum][index + i] = this._nullVal;
                }
            } else throw new Error('Null value not valid for this VolumetricData.');
        } else {
            if (this._numElementsPerVox !== val.length) throw new Error('setValues() val param must be same length as numElementsPerVox.');
            for (let i = 0; i < this._numElementsPerVox; i++) {
                this._data[arrayNum][index + i] = val[i];
            }
        }
    }

    /**
     * set vector 3 at voxel
     * @param {Integer} x - x position
     * @param {Integer} y - y position
     * @param {Integer} z - z position
     * @param {Vector3 | null} vec - data
     */
    setVector3(x, y, z, vec) {
        if (this._numElementsPerVox !== 3) throw new Error('Must be exactly three elements per voxel to call setVector3().');
        const [arrayNum, index] = this._getArrayIndicesForZ(x, y, z);
        if (vec === null) {
            if (this._useNull) {
                this._data[arrayNum][index] = this._nullVal;
                this._data[arrayNum][index + 1] = this._nullVal;
                this._data[arrayNum][index + 2] = this._nullVal;
            } else throw new Error('Null value not valid for this BufferedVolumetricDataRW.');
        } else {
            this._data[arrayNum][index] = vec.x;
            this._data[arrayNum][index + 1] = vec.y;
            this._data[arrayNum][index + 2] = vec.z;
        }
    }

    /**
     * set 8 bit vector 3 at voxel
     * @param {Integer} x - x position
     * @param {Integer} y - y position
     * @param {Integer} z - z position
     * @param {Vector3 | null} vec - data
     */
    setFloat8Vector3(x, y, z, vec) {
        if (vec) {
            vec = vec.clone().multiplyScalar(127).addScalar(127).round();
        }
        this.setVector3(x, y, z, vec);
    }

    /**
     * get single value corresponding to voxel
     * @param {Integer} x - x position
     * @param {Integer} y - y position
     * @param {Integer} z - z position
     * @returns {Number|null} value at voxel or null
     */
    get(x, y, z) {
        if (this._numElementsPerVox !== 1) throw new Error('Must be exactly 1 element per voxel to call get().');
        const [arrayNum, index] = this._getArrayIndicesForZ(x, y, z);
        const val = this._data[arrayNum][index];
        if (this._useNull && val === this._nullVal) return null;
        return val;
    }

    /**
     * get array of elements corresponding to voxel
     * @param {Integer} x - x position
     * @param {Integer} y - y position
     * @param {Integer} z - z position
     * @returns {Array|null} values at voxel or null
     */
    getValues(x, y, z) {
        if (this._numElementsPerVox === 1) throw new Error('Must be more than 1 element per voxel to call getValues().');
        const [arrayNum, index] = this._getArrayIndicesForZ(x, y, z);
        const vals = [this._data[arrayNum][index]];
        if (this._useNull && vals[0] === this._nullVal) return null;
        for (let i = 1; i < this._numElementsPerVox; i++) {
            const nextVal = this._data[arrayNum][index + i];
            if (this._useNull && nextVal === this._nullVal) return vals;
            vals.push(nextVal);
        }
        return vals;
    }

    /**
     * get Vector3 corresponding to voxel
     * @param {Integer} x - x position
     * @param {Integer} y - y position
     * @param {Integer} z - z position
     * @returns {Vector3|null} Vector3 at voxel or null
     */
    getVector3(x, y, z) {
        if (this._numElementsPerVox !== 3) throw new Error('Must be exactly three elements per voxel to call getVector3().');
        const [arrayNum, index] = this._getArrayIndicesForZ(x, y, z);
        const xVal = this._data[arrayNum][index];
        if (this._useNull && xVal === this._nullVal) return null;
        return new Vector3(xVal, this._data[arrayNum][index + 1], this._data[arrayNum][index + 2]);
    }

    /**
     * get Vector3 corresponding to voxel (this is used for normals, that's why there's a normalize)
     * @param {Integer} x - x position
     * @param {Integer} y - y position
     * @param {Integer} z - z position
     * @returns {Vector3|null} Vector3 at voxel or null
     */
    getFloat8Vector3(x, y, z) {
        const vec = this.getVector3(x, y, z);
        vec.subScalar(127).multiplyScalar(1 / 127);
        return vec.normalize();
    }

    getLayer(z) {
        const [arrayNum, index] = this._getArrayIndicesForZ(0, 0, z);
        z -= arrayNum * this._arraydimZ;
        return this._data[arrayNum].slice(z * this._dim.x * this._dim.y * this._numElementsPerVox,
            (z + 1) * this._dim.x * this._dim.y * this._numElementsPerVox);
    }

    clear() {
        const clearVal = this._useNull ? this._nullVal : 0;
        const size = this._adjustedDim.x * this._adjustedDim.y * this._adjustedDim.z * this._numElementsPerVox;
        for (let j = 0; j < this._numArrays; j++) {
            for (let i = 0; i < size; i++) {
                this._data[j][i] = clearVal;
            }
        }
    }

    // saveAsVol(path, filename) {
    //     let fd = fs.openSync(`${path}${filename}.vol`, 'w');
    //     const layerSize = this._dim.y * this._dim.x * this._numElementsPerVox;
    //     let buffer = Buffer.alloc(layerSize * this._dataSize);
    //     for (let z = 0; z < this._dim.z; z++) {
    //         const offset = z * layerSize;
    //         for (let y = 0; y < this._dim.y; y++) {
    //             for (let x = 0; x < this._dim.x; x++) {
    //                 for (let i = 0; i < this._numElementsPerVox; i++) {
    //                     const index = this._numElementsPerVox * (this._dim.x * y + x) + i;
    //                     switch (this._type) {
    //                         case 'float32':
    //                             buffer.writeFloatLE(this._data[offset + index], 4 * index);
    //                             break;
    //                         case 'int32':
    //                             buffer.writeInt32LE(this._data[offset + index], 4 * index);
    //                             break;
    //                         case 'uint8':
    //                             buffer[index] = this._data[offset + index];
    //                             break;
    //                         default:
    //                             throw new Error(`Unknown type ${this._type}.`);
    //                     }
    //                 }
    //             }
    //         }
    //         fs.writeSync(fd, buffer, 0, buffer.length, this._dataSize);
    //     }
    //     fs.closeSync(fd);
    //     fd = null;
    //     buffer = null;
    // }

    /**
     * close file, clear all memory for garbage collection
     */
    destroy() {
        this._data = null;
    }
}

module.exports = VolumetricData;
