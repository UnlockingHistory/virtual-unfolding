import { Vector3 } from 'three';
import { performance } from 'perf_hooks';
import { TomType, TomTypedArray, TypedArray, Type, GPUBufferDataType } from './types';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import * as del from 'del';
import { DATA_PATH, FILENAME, OUTPUT_PATH } from './Defaults';
import { getTomDimensions } from './io';

/**
 * Returns the number of bytes per element of a given data type.
 * @param {string} type string describing data type
 * @returns {number} number of bytes per element of type
 */
export function dataSizeForType(type: TomType | 'uint16' | 'int16') {
	switch (type) {
		case 'uint8':
			return 1;
		case 'int16':
			return 2;
		case 'uint16':
			return 2;
		case 'int32':
			return 4;
		case 'uint32':
			return 4;
		case 'float32':
			return 4;
		default:
			throw new Error(`Unknown type ${type}.`);
	}
};

/**
 * Returns the number we are reserving as 'null' for a given data type.
 * @param {string} type string describing data type
 * @returns {number} null value for that data type
 */
export function nullValForType(type: Type) {
	switch (type) {
		case 'int32':
			return -10000;// TODO: let's use a proper NaN value here.
		case 'float32':
			return -10000;// TODO: let's use a proper NaN value here.
		default:
			throw new Error(`No null supported for type ${type}.`);
	}
};

export function typeOfTypedArray(typedArray: TomTypedArray): TomType;
export function typeOfTypedArray(typedArray: TypedArray): Type;
export function typeOfTypedArray(typedArray: TypedArray): Type;
export function typeOfTypedArray(typedArray: any) {
	// Get data type from TypedArray.
	switch (typedArray.constructor) {
		case Uint8Array:
			return 'uint8';
		case Float32Array:
			return 'float32';
		case Int32Array:
			return 'int32';
		case Uint32Array:
			return 'uint32';
		case Uint16Array:
			return 'uint16';
		case Int16Array:
			return 'int16';
		default:
			throw new Error(`Unknown type for tom file:  ${typedArray.constructor}`)
	}
}

export function gpuTypeForType(type: Type) {
	switch (type) {
		case 'uint8':
			return 'uchar*' as GPUBufferDataType;
		case 'float32':
			return 'float*' as GPUBufferDataType;
		case 'int32':
			return 'int*' as GPUBufferDataType;
		// case 'uint32':
		// 	return 'uint*';
		default:
			throw new Error(`Unsupported type:  ${type}`)
	}
}

export function typeForGPUType(type: GPUBufferDataType): Type {
	switch (type) {
		case 'uchar*':
			return 'uint8';
		case 'float*':
			return 'float32';
		case 'int*':
			return 'int32';
		// case 'uint32':
		// 	return 'uint*';
		default:
			throw new Error(`Unsupported type:  ${type}`)
	}
}

/**
 * Returns the file type extension of a filename.
 * @param {string} filenameWithExtension
 * @returns {string} extension, no period
 */
export function getExtension(filenameWithExtension: string) {
	const parts = filenameWithExtension.split('.');
	if (parts.length < 2) {
		throw new Error(`Invalid filename: ${filenameWithExtension}, or no extension present.`);
	}
	return parts[parts.length - 1];
};

/**
 * Returns the filename with no extension.
 * @param {string} filenameWithExtension
 * @returns {string} filename without extension
 */
export function removeExtension(filenameWithExtension: string) {
	const parts = filenameWithExtension.split('.');
	if (parts.length < 2) {
		throw new Error(`Invalid filename: ${filenameWithExtension}, or no extension present.`);
	}
	parts.pop();
	return parts.join('.');
};

/**
 * Tests if a number is an integer.
 * @param {number} num number to be tested
 * @returns {boolean} true if num is an integer, else false
 */
export function isInteger(num: number) {
	return Number.isInteger(num);
}

/**
 * Tests if a number is a positive integer (strictly > 0).
 * @param {number} num number to be tested
 * @returns {boolean} true if num is a positive integer, else false
 */
export function isPositiveInteger(num: number) {
	return isInteger(num) && num > 0;
}

/**
 * Tests if a number is a non-negative integer (>= 0).
 * @param {number} num number to be tested
 * @returns {boolean} true if num is a non-negative integer, else false
 */
export function isNonNegativeInteger(num: number) {
	return isInteger(num) && num >= 0;
}

export function checkType(number: number, type: Type) {
	switch(type) {
		case 'uint8':
			return isUint8(number);
		case 'float32':
			return isFloat32(number);
		case 'uint32':
			return isUint32(number);
		case 'int32':
			return isInt32(number);
		default:
			throw new Error(`Need to implement check for type ${type} in utils.`);
	}
}

/**
 * Tests if a number is a uint8.
 * @param {number} num number to be tested
 * @returns {boolean} true if num is a uint8, else false
 */
export function isUint8(num: number) {
	return isInteger(num) && num >= 0 && num < 256;
};

/**
 * Tests if a number is a uint32.
 * @param {number} num number to be tested
 * @returns {boolean} true if num is a uint32, else false
 */
export function isUint32(num: number) {
	return isInteger(num) && num >= 0 && num <= 0xFFFFFFFF;
};

/**
 * Tests if a number is a int32.
 * @param {number} num number to be tested
 * @returns {boolean} true if num is a int32, else false
 */
export function isInt32(num: number) {
	return isInteger(num) && num >= Number.MIN_SAFE_INTEGER && num <= Number.MAX_SAFE_INTEGER;
};

export function arrayIntersection(array1: any[], array2: any[]) {
	return array1.filter(el => array2.indexOf(el) !== -1);
}

/**
 * Tests if a number is a float32.
 * @param {number} num number to be tested
 * @returns {boolean} true if num is a float32, else false
 */
export function isFloat32(num: number) {
	return num >= -Number.MAX_VALUE && num <= Number.MAX_VALUE;
};

/**
 * Tests if an object is an Array.
 * @param {object} arr object to be tested
 * @returns {boolean} true if arr is an array, else false
 */
export function isArray(arr: any) {
	return Array.isArray(arr) || isTypedArray(arr);
};

/**
 * Tests if an object is a TypedArray.
 * @param {object} arr object to be tested
 * @returns {boolean} true if arr is a TypedArray, else false
 */
export function isTypedArray(arr: any) {
	return !!(arr?.buffer instanceof ArrayBuffer && arr?.BYTES_PER_ELEMENT);
};

/**
 * Returns 1D index from 3D index (x, y, z)
 * @param {Integer} x x index
 * @param {Integer} y y index
 * @param {Integer} z z index
 * @param {Vector3} dim dimensions of dataset
 * @returns {Integer} 1D index
 */
export function index3Dto1D(index3D: Vector3, dim: Vector3) {
	// Check input params are valid.
	if (!isInteger(index3D.x) || !isInteger(index3D.y) || !isInteger(index3D.z)) throw new Error(`Invalid index3D: ${stringifyVector3(index3D)}.`);

	// Check in bounds.
	if (!index3DInBounds(index3D, dim)) {
		throw new Error(`Invalid index3D: ${stringifyVector3(index3D)} for buffer dimensions: ${stringifyVector3(dim)}.`);
	}

	// Calc 1D index based on z, y, x ordering.
	return (index3D.z * dim.x * dim.y) + (index3D.y * dim.x) + index3D.x;
};

/**
 * 1D index to 3D index
 * @param {Integer} i 1D index
 * @param {Vector3} dim dimensions of dataset
 * @param {Vector3} v a vector to store the output (so new Vector3 does not need to be allocated)
 * @returns {Vector3} 3D index
 */
export function index1Dto3D(i: number, dim: Vector3, v: Vector3) {
	// Check input params are valid.
	if (!isInteger(dim.x) || !isInteger(dim.y) ||
		!isInteger(dim.z)) throw new Error(`Invalid dimension parameter: ${stringifyVector3(dim)}.`);
	if (!isInteger(i)) throw new Error(`Invalid index parameter: ${i}.`);

	// Check in bounds.
	if (i < 0 || i >= dim.x * dim.y * dim.z) {
		throw new Error(`Attempting to access out of bounds index: ${i} for dimensions: ${stringifyVector3(dim)}.`);
	}

	// Calc 3D index based on z, y, x ordering.
	const z = Math.floor(i / (dim.x * dim.y));
	const y = Math.floor((i % (dim.x * dim.y)) / dim.x);
	const x = ((i % (dim.x * dim.y)) % dim.x);
	return v.set(x, y, z);
};

/**
 * converts a 3D position to an index in a voxel array, round to nearest integer voxel
 * returns null if position is outside dimensions
 * @param {Vector3} position 3D position
 * @param {Vector3} dim dimensions of dataset
 * @returns {Vector3|null}
 */
export function positionToIndex3D(position: Vector3, v: Vector3, dim?: Vector3) {
	// const index = (position.clone().sub(new Vector3(0.5, 0.5, 0.5))).round();
	// // float -0 is messing things up
	// index.x = parseInt(index.x, 10);
	// index.y = parseInt(index.y, 10);
	// index.z = parseInt(index.z, 10);
	v.copy(position);
	v.x = Math.floor(v.x);
	v.y = Math.floor(v.y);
	v.z = Math.floor(v.z);
	if (dim === undefined) return v;
	// Perform additional checks
	if (!index3DInBounds(v, dim)) return null;
	return v;
};

/**
 * checks if an index is in bounds
 * @param {Vector3} index current index
 * @param {Vector3} dim dimensions of file
 * @returns {Boolean} true if in bounds, else false
 */
export function index3DInBounds(index: Vector3, dim: Vector3) {
	if (index.x < 0 || index.y < 0 || index.z < 0) return false;
	if (index.x >= dim.x || index.y >= dim.y || index.z >= dim.z) return false;
	return true;
};

// /**
//  * converts a 3D position to an index in a voxel array, round to nearest integer voxel
//  * returns null if position is outside dimensions
//  * @param {Vector3} position 3D position
//  * @param {Vector3} dim dimensions of dataset
//  * @returns {Vector3|null}
//  */
// export function index3DtoPosition(index3D: Vector3) {
// 	return index3D.clone().addScalar(0.5);
// };

// /**
//  * create Vector3 from data in 1D array, may return null if data contains nullVal placeholders
//  * @param {Integer} index index in data array
//  * @param {Array} array data
//  * @param {String} [type='float32'] - data type (for determining if data is null)
//  * @returns {Vector3|null}
//  */
// export function vector3ForIndex(index: number, array: number[], type: DataType = 'float32') {
// 	if (index < 0 || index >= array.length / 3) throw new Error(`Index out of range: ${index}.`);
// 	const xVal = array[3 * index];
// 	if (xVal === nullValForType(type)) return null;
// 	return new Vector3(xVal, array[(3 * index) + 1], array[(3 * index) + 2]);
// };

// export function convertNeighborsToEdges(neighbors) {
// 	let twiceNumEdges = 0;
// 	for (let i = 0; i < neighbors.length; i++) {
// 		twiceNumEdges += neighbors.get(i).length;
// 	}
// 	const edges = new Uint32Array(twiceNumEdges);
// 	let index = 0;
// 	for (let i = 0; i < neighbors.length; i++) {
// 		const _neighbors = neighbors.get(i);
// 		for (let j = 0; j < _neighbors.length; j++) {
// 			if (_neighbors[j] > i) {
// 				edges[index] = _neighbors[j];
// 				edges[index + 1] = i;
// 				index += 2;
// 			}
// 		}
// 	}
// 	return edges;
// };

/**
 * clamp value between min and max (inclusive)
 * @param {Number} val value to clamp
 * @param {Number} min min value
 * @param {Number} max max value
 * @returns {Number}
 */
export function clamp(val: number, min: number, max: number) {
	if (min > max) throw new Error(`Invalid range for clamp: min ${min}, max ${max}.`);
	return Math.min(Math.max(val, min), max);
};


export function stringifyVector3(vector3: Vector3) {
	return `[ ${vector3.x}, ${vector3.y}, ${vector3.z} ]`;
};

export function safeClearDirectory(fullPath: string) {
	if (existsSync(fullPath)) {
		del.sync([`${fullPath}*`]);
	}
}

export function safeDeleteFile(fullPath: string) {
	if (existsSync(fullPath)) {
		unlinkSync(fullPath);
	}
}

export function addDirectoryIfNeeded(fullPath: string) {
	if (!existsSync(fullPath)) {
		mkdirSync(fullPath);
	}
}

export function log(string: string) {
	if (process.env.VERBOSE === 'true') console.log(string);
}

export function logTime(string: string, startTime: number) {
	if (process.env.VERBOSE === 'true') console.log(`${string}: ${(performance.now() - startTime).toFixed(2)} ms\n`);
}


export function getRuntimeParams() {
	const _FILENAME = process.env.FILENAME ? process.env.FILENAME : FILENAME;
	const _OUTPUT_PATH = process.env.OUTPUT_PATH ? process.env.OUTPUT_PATH : OUTPUT_PATH;
	const _FILE_OUTPUT_PATH = `${_OUTPUT_PATH}${_FILENAME}/`;
	const _FILE_DATA_PATH = process.env.DATA_PATH ? process.env.DATA_PATH : DATA_PATH;
	const _DIMENSIONS = getTomDimensions(_FILE_DATA_PATH, _FILENAME);

	console.log(`Processing file: ${_FILENAME} with dimensions: ${stringifyVector3(_DIMENSIONS)}\n`);

	// Make output directories if needed.
	addDirectoryIfNeeded(_OUTPUT_PATH);
	addDirectoryIfNeeded(_FILE_OUTPUT_PATH);

	return {
		FILENAME: _FILENAME,
		DIMENSIONS: _DIMENSIONS,
		DATA_PATH: _FILE_DATA_PATH,
		OUTPUT_PATH: _FILE_OUTPUT_PATH,
	};
}