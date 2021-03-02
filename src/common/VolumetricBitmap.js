const utils = require('./utils');

/**
 * 1 bit data that can be stored in memory at once
 * uses Uint8 data type for storage
 */
class VolumetricBitmap {
    /**
     * @constructor
     * @param {Vector3} dim - dimensions of data
     */
    constructor(dim) {
        if (dim === undefined) throw new Error('Missing dimension param for VolumetricBitmap.');
        if (dim.x <= 0 || dim.y <= 0 || dim.z <= 0 || !utils.isInteger(dim.x) ||
            !utils.isInteger(dim.y) || !utils.isInteger(dim.z)) throw new Error('Dimensions for VolumetricBitmap must be positive integers.');

        this._dim = dim;
        this._numElements = dim.x * dim.y * dim.z;
        this._data = new Uint8Array(Math.ceil(this._numElements / 8));
    }

    get(x, y, z) {
        const index = utils.index3Dto1D(x, y, z, this._dim);
        /* eslint-disable-next-line no-bitwise */
        return (this._data[Math.floor(index / 8)] & (1 << index % 8)) > 0;
    }

    set(x, y, z, state) {
        if (state === undefined || state === null) {
            throw new Error('Missing state in VolumetricBitmap setter.');
        }
        const index = utils.index3Dto1D(x, y, z, this._dim);
        const byteIndex = Math.floor(index / 8);
        let byte = this._data[byteIndex];
        const offset = index % 8;
        /* eslint-disable-next-line no-bitwise */
        if (state) byte |= 1 << offset;
        /* eslint-disable-next-line no-bitwise */
        else byte &= 255 - (1 << offset);
        this._data[byteIndex] = byte;
    }

    getData() {
        return this._data.slice();
    }

    setData(data) {
        this._data = data;
    }

    /**
     * set everything to zero
     */
    clear() {
        for (let i = 0; i < this._data.length; i++) {
            this._data[i] = 0;
        }
    }

    /**
     * close file, clear all memory for garbage collection
     */
    destroy() {
        this._data = null;
    }
}

module.exports = VolumetricBitmap;
