import { Vector3 } from 'three';
import { 
	TOM_HEADER_NUM_BYTES,
	TOM_DIMENSIONS_START_POSITION,
	TOM_DIMENSIONS_NUM_BYTES,
	TOM_DATA_TYPE_START_POSITION,
	TOM_DATA_TYPE_NUM_BYTES,
	TOM_NUM_ELEMENTS_MARKER,
	TOM_NUM_ELEMENTS_START_POSITION,
	TOM_NUM_ELEMENTS_NUM_BYTES,
	TOM_USE_NULL_MARKER,
	TOM_USE_NULL_START_POSITION,
	TOM_USE_NULL_NUM_BYTES,
	BIN_HEADER_NUM_BYTES,
	BIN_DIMENSIONS_START_POSITION,
	BIN_DIMENSIONS_NUM_BYTES,
	BIN_DATA_TYPE_START_POSITION,
	BIN_DATA_TYPE_NUM_BYTES,
	BIN_NUM_ELEMENTS_START_POSITION,
	BIN_NUM_ELEMENTS_NUM_BYTES,
	BIN_USE_NULL_START_POSITION,
	BIN_USE_NULL_NUM_BYTES,
	MAX_NUM_ELEMENTS,
} from './Defaults';
import { TomTypedArray, TomType, TypedArray, Type } from './types';
import { stringifyVector3, isPositiveInteger, isNonNegativeInteger, dataSizeForType, typeOfTypedArray } from './utils';
import { openSync, statSync, readSync, closeSync, writeSync, readFileSync } from 'fs';
import GPUHelper from './GPUHelper';

// Tom header
// [22*2 = 44 bytes] uint16_t xsize,ysize,zsize,lmarg,rmarg,tmarg,bmarg,tzmarg,bzmarg,num_samples,num_proj,num_blocks,num_slices,bin,gain,speed,pepper,issue,num_frames,spare_int[13]__attribute__((packed));
// [13*4 = 52 bytes] float32 scale,offset,voltage,current,thickness,pixel_size,distance,exposure,mag_factor,filterb,correction_factor,spare_float[2]__attribute__((packed));
// [8*4 = 32 bytes] uint32_t z_shift,z,theta,spare_uint32[5]__attribute__((packed));
// [384*1 = 384 bytes] char time[26],duration[12],owner[21],user[5],specimen[32],scan[32],comment[64],spare_char[192];

// Init some arrays and buffers to use for moving data in and out of files.
const tomHeaderBuffer = Buffer.alloc(TOM_HEADER_NUM_BYTES);
const binHeaderBuffer = Buffer.alloc(BIN_HEADER_NUM_BYTES);
const stringBuffer = Buffer.alloc(100);

// Be careful when using this function, it inits a lot of memory, use BufferedTomR instead.
export function readTom(path: string, filename: string) {
	const fullPath = `${path}${filename}.tom`;

	// Read data.
	const type = getTomDataType(path, filename);
	const typedArray = readDataAsType(fullPath, type, TOM_HEADER_NUM_BYTES);

	// Check that data is correct size.
	const numElements = getTomNumElements(path, filename);
	const dimensions = getTomDimensions(path, filename);
	if (typedArray.length !== dimensions.x * dimensions.y * dimensions.z * numElements) {
		throw new Error(`Error reading ${fullPath}. Expected tom dimensions ${stringifyVector3(dimensions)}, num elements ${numElements}, not compatible with data of length ${typedArray.length}.`);
	}

	return typedArray;
};

export function getTomDimensions(path: string, filename: string, file?: number) {
	const fullPath = `${path}${filename}.tom`;

	// Read data.
	const buffer = readDataToBuffer(fullPath, tomHeaderBuffer, TOM_DIMENSIONS_START_POSITION, TOM_DIMENSIONS_NUM_BYTES, file);

	// Create Vector3 from dimensions.
	const dim = new Vector3(buffer.readUInt16LE(0), buffer.readUInt16LE(2), buffer.readUInt16LE(4));
	if (!isPositiveInteger(dim.x) || !isPositiveInteger(dim.y) || !isPositiveInteger(dim.z)) {
		throw new Error(`Error reading ${fullPath}. Tom dimensions must be positive integers: ${stringifyVector3(dim)}`);
	}
	return dim;
};

export function getTomNumElements(path: string, filename: string, file?: number) {
	const fullPath = `${path}${filename}.tom`;

	// Read marker from header, should read 'NumEl'.
	const marker = readString(fullPath, TOM_NUM_ELEMENTS_START_POSITION, TOM_NUM_ELEMENTS_MARKER.length, file);
	if (marker != TOM_NUM_ELEMENTS_MARKER) {
		// This is a tom file not generated by us, assume 1 element per voxel.
		return 1;
	}

	// Read next byte to get num elements.
	const buffer = readDataToBuffer(fullPath, tomHeaderBuffer, TOM_NUM_ELEMENTS_START_POSITION + TOM_NUM_ELEMENTS_MARKER.length,
		TOM_NUM_ELEMENTS_NUM_BYTES, file);

	// Parse as Uint8.
	const numElements = buffer[0];
	if (!isPositiveInteger(numElements)) {
		throw new Error(`Error reading ${fullPath}. Invalid num elements: ${numElements}.`);
	}
	return numElements;
};

export function getTomUseNull(path: string, filename: string, file?: number) {
	const fullPath = `${path}${filename}.tom`;

	// Read marker from header, should read 'Null'.
	const marker = readString(fullPath, TOM_USE_NULL_START_POSITION, TOM_USE_NULL_MARKER.length, file);
	if (marker != TOM_USE_NULL_MARKER) {
		// This is a tom file not generated by us, assume null is not encoded.
		return false;
	}

	// Read next byte to get use null bit.
	const buffer = readDataToBuffer(fullPath, tomHeaderBuffer, TOM_USE_NULL_START_POSITION + TOM_USE_NULL_MARKER.length,
		TOM_USE_NULL_NUM_BYTES, file);

	// Parse as bool.
	const useNull = buffer[0];
	if (!isNonNegativeInteger(useNull) || useNull > 1) {
		throw new Error(`Error reading ${fullPath}. Invalid use null flag: ${useNull}.`);
	}
	return useNull > 0;
};

export function getTomDataType(path: string, filename: string, file?: number): TomType {
	// Read string from file.
	const type = readString(`${path}${filename}.tom`, TOM_DATA_TYPE_START_POSITION, TOM_DATA_TYPE_NUM_BYTES, file).replace(/\0/g, '');

	// Parse data type.
	switch(type) {
		case 'float32':
			return 'float32';
		case 'uint32':
			return 'uint32';
		case 'int32':
			return 'int32';
		case 'uint8':
		default:
			// Orig tom data from ct scans do not have datatype info in them.
			// We assume these are uint8.
			return 'uint8';
	}
}

export function readBin(path: string, filename: string, file?: number) {
	const fullPath = `${path}${filename}.bin`;
	let _file = file;
	// Open file if needed.
	if (_file === undefined) {
		_file = openSync(fullPath, 'r');
	}

	// Read data.
	const type = getBinDataType(path, filename, file);
	const length = getBinLength(path, filename,file);
	const numElements = getBinNumElements(path, filename, file);
	const typedArray = readDataAsType(fullPath, type, BIN_HEADER_NUM_BYTES, length*numElements*dataSizeForType(type), file);

	// Close file if needed.
	if (file === undefined) {
		closeSync(_file);
	}

	return typedArray;
};

export function getBinLength(path: string, filename: string, file?: number) {
	const fullPath = `${path}${filename}.bin`;

	// Read data.
	const buffer = readDataToBuffer(fullPath, binHeaderBuffer, BIN_DIMENSIONS_START_POSITION, BIN_DIMENSIONS_NUM_BYTES, file);

	// Create uint32 from dimensions.
	const length =  buffer.readUInt32LE(0);
	if (!isPositiveInteger(length)) {
		throw new Error(`Error reading ${fullPath}. Invalid .bin length: ${length}.`);
	}
	return length;
};

export function getBinNumElements(path: string, filename: string, file?: number) {
	const fullPath = `${path}${filename}.bin`;

	// Get data.
	const buffer = readDataToBuffer(fullPath, binHeaderBuffer, BIN_NUM_ELEMENTS_START_POSITION, BIN_NUM_ELEMENTS_NUM_BYTES, file);

	// Parse as Uint8.
	const numElements = buffer[0]
	if (!isPositiveInteger(numElements)) {
		throw new Error(`Error reading ${fullPath}. Invalid num elements: ${numElements}.`);
	}
	return numElements;
};

export function getBinUseNull(path: string, filename: string, file?: number) {
	const fullPath = `${path}${filename}.bin`;

	// Get data.
	const buffer = readDataToBuffer(fullPath, binHeaderBuffer, BIN_USE_NULL_START_POSITION, BIN_USE_NULL_NUM_BYTES, file);

	// Parse as bool.
	const useNull = buffer[0];
	if (!isNonNegativeInteger(useNull) || useNull > 1) {
		throw new Error(`Error reading ${fullPath}. Invalid use null flag: ${useNull}.`);
	}
	return useNull > 0;
};

export function getBinDataType(path: string, filename: string, file?: number) {
	const fullPath = `${path}${filename}.bin`;

	// Read string from file.
	const type = readString(fullPath, BIN_DATA_TYPE_START_POSITION, BIN_DATA_TYPE_NUM_BYTES, file).replace(/\0/g, '');

	// Parse data type.
	switch(type) {
		case 'float32':
			return 'float32';
		case 'uint8':
			return 'uint8';
		case 'uint32':
			return 'uint32';
		case 'int32':
			return 'int32';
		default:
			throw new Error(`Error reading ${fullPath}. Unknown data type: ${type}`);
	}
}

export function readDataAsType(fullPath: string, type: TomType, start: number, length?: number, file?: number): TomTypedArray;
export function readDataAsType(fullPath: string, type: Type, start: number, length?: number, file?: number): TypedArray;
export function readDataAsType(fullPath: string, type: TomType | Type, start: number, length?: number, file?: number) {
	// If no length passed, assume read to end of file.
	if (length === undefined) length = statSync(fullPath).size - start;
	// Allocate buffer.
	const buffer = Buffer.alloc(length);

	// Allocate TypedArray.
	const dataSize = dataSizeForType(type);
	const typedArrayLength = buffer.length / dataSize;
	let typedArray;
	switch (type) {
		case 'uint8':
			typedArray = new Uint8Array(typedArrayLength);
			break;
		case 'uint16':
			typedArray = new Uint16Array(typedArrayLength);
			break;
		case 'int16':
			typedArray = new Int16Array(typedArrayLength);
			break;
		case 'uint32':
			typedArray = new Uint32Array(typedArrayLength);
			break;
		case 'int32':
			typedArray = new Int32Array(typedArrayLength);
			break;
		case 'float32':
			typedArray = new Float32Array(typedArrayLength);
			break;
		default:
			throw new Error(`Error reading ${fullPath}. Unsupported type: ${type}.`);
	}
	return readDataToArray(fullPath, start, typedArray, buffer, file);
}

function parseBufferToTypedArray(buffer: Buffer, typedArray: TypedArray): TypedArray;
function parseBufferToTypedArray(buffer: Buffer, typedArray: TomTypedArray): TomTypedArray;
function parseBufferToTypedArray(buffer: Buffer, typedArray: TypedArray | TomTypedArray) {
	const type = typeOfTypedArray(typedArray);
	const dataSize = dataSizeForType(type);
	if (buffer.length !== typedArray.length * dataSize) {
		throw new Error(`Incompatible buffer lengths for reading tom: ${buffer.length}, ${typedArray.length * dataSize}`)
	}
	const length = typedArray.length;
	switch (type) {
		case 'uint8':
			// Buffer is same as Uint8Array, but we must explicitly cast it as a UInt8Array
			// so that the constructor checks work.
			for (let i = 0; i < length; i++) {
				typedArray[i] = buffer[i];
			}
			break;
		case 'uint16':
			for (let i = 0; i < length; i++) {
				typedArray[i] = buffer.readUInt16LE(dataSize * i);
			}
			break;
		case 'int16':
			for (let i = 0; i < length; i++) {
				typedArray[i] = buffer.readInt16LE(dataSize * i);
			}
			break;
		case 'uint32':
			for (let i = 0; i < length; i++) {
				typedArray[i] = buffer.readUInt32LE(dataSize * i);
			}
			break;
		case 'int32':
			for (let i = 0; i < length; i++) {
				typedArray[i] = buffer.readInt32LE(dataSize * i);
			}
			break;
		case 'float32':
			for (let i = 0; i < length; i++) {
				typedArray[i] = buffer.readFloatLE(dataSize * i);
			}
			break;
		default:
			throw new Error(`Unsupported type: ${type}.`);
	}
	return typedArray;
}

export function readDataToArray(fullPath: string, start: number, typedArray: TomTypedArray, buffer: Buffer, file?: number): TomTypedArray;
export function readDataToArray(fullPath: string, start: number, typedArray: TypedArray, buffer: Buffer, file?: number): TypedArray
export function readDataToArray(fullPath: string, start: number, typedArray: TomTypedArray | TypedArray, buffer: Buffer, file?: number) {
	return parseBufferToTypedArray(readDataToBuffer(fullPath, buffer, start, buffer.length, file), typedArray);
}

function readDataToBuffer(fullPath: string, buffer: Buffer, start: number, length = buffer.length, file?: number) {
	let _file = file;

	// Optionally open file.
	if (_file === undefined) {
		_file = openSync(fullPath, 'r')
	}
	// Load up buffer.
	readSync(_file, buffer, 0, length, start);

	// Optionally close file.
	if (file === undefined) {
		closeSync(_file);
	}

	return buffer;
}

function readString(fullPath: string, startPosition: number, length: number, file?: number) {
	let _file = file;
	
	// Optionally open file.
	if (_file === undefined) {
		_file = openSync(fullPath, 'r')
	}

	// Load up buffer with full size of file (minus header).
	readSync(_file, stringBuffer, 0, length, startPosition);

	// Optionally close file.
	if (file === undefined) {
		closeSync(_file);
	}

	// Parse as utf-8.
	return stringBuffer.toString('utf-8', 0, length);
}

// Be careful when using this function, it inits a lot of memory, use BufferedTomW instead.
export function writeTom(path: string, filename: string, typedArray: TomTypedArray, dimensions: Vector3, numElements = 1, useNull = false) {
	const fullPath = `${path}${filename}.tom`;

	// Check typedArray.
	const { length } = typedArray;
	if (length === 0) {
		throw new Error(`Error saving ${fullPath}. Attempting to save array of length 0.`);
	}
	if (length !== dimensions.x * dimensions.y * dimensions.z * numElements) {
		throw new Error(`Error saving ${fullPath}. Dimensions ${stringifyVector3(dimensions)}, num elements per voxel: ${numElements} not compatible with data of length ${length}.`);
	}
	
	// Get data type from TypedArray.
	const type = typeOfTypedArray(typedArray);
	// Get data type length.
	const dataLength = dataSizeForType(type);	

	// Open file.
	let fd = openSync(fullPath, 'w');

	// Write header.
	writeTomHeaderToBuffer(fullPath, tomHeaderBuffer, type, dimensions, numElements, useNull);
	writeSync(fd, tomHeaderBuffer);

	// Fill buffer with data.
	const buffer = Buffer.alloc(typedArray.length * dataLength);
	writeDataToBuffer(typedArray, buffer, fullPath);
	writeSync(fd, buffer);
	
	// Close file.
	closeSync(fd);
}

export function copyTom(inputPath: string, inputFilename: string, outputPath: string, outputFilename: string) {

	// Get metadata.
	const type = getTomDataType(inputPath, inputFilename);
	const numElements = getTomNumElements(inputPath, inputFilename);
	const useNull = getTomUseNull(inputPath, inputFilename);
	const dimensions = getTomDimensions(inputPath, inputFilename);

	const fullPath = `${outputPath}${outputFilename}.tom`;

	// Open files.
	let inputFile = openSync(`${inputPath}${inputFilename}.tom`, 'r');
	let outputFile = openSync(fullPath, 'w');

	// Write header.
	writeTomHeaderToBuffer(fullPath, tomHeaderBuffer, type, dimensions, numElements, useNull);
	writeSync(outputFile, tomHeaderBuffer);

	// Init a buffer to hold a single layer of data.
	const layerBuffer = Buffer.alloc(dataSizeForType(type) * numElements * dimensions.x * dimensions.y);
	// Loop through z layers and write each layer.
	for (let z = 0; z < dimensions.z; z++) {
		readSync(inputFile, layerBuffer, 0, layerBuffer.length, TOM_HEADER_NUM_BYTES + z * layerBuffer.length);
		writeSync(outputFile, layerBuffer, 0, layerBuffer.length, TOM_HEADER_NUM_BYTES + z * layerBuffer.length);
	}

	// Close file.
	closeSync(inputFile);
	closeSync(outputFile);
}

export function copyTomAsFloat32(inputPath: string, inputFilename: string, outputPath: string, outputFilename: string) {

	// Get metadata.
	const type = getTomDataType(inputPath, inputFilename);
	const numElements = getTomNumElements(inputPath, inputFilename);
	const useNull = getTomUseNull(inputPath, inputFilename);
	const dimensions = getTomDimensions(inputPath, inputFilename);

	const fullPath = `${outputPath}${outputFilename}.tom`;

	// Open files.
	let inputFile = openSync(`${inputPath}${inputFilename}.tom`, 'r');
	let outputFile = openSync(fullPath, 'w');

	// Write header.
	writeTomHeaderToBuffer(fullPath, tomHeaderBuffer, 'float32', dimensions, numElements, useNull);
	writeSync(outputFile, tomHeaderBuffer);

	// Init a buffer to hold a single layer of data.
	const layerBufferInput = Buffer.alloc(dataSizeForType(type) * numElements * dimensions.x * dimensions.y);
	const layerBufferOutput = Buffer.alloc(dataSizeForType('float32') * numElements * dimensions.x * dimensions.y);
	// Loop through z layers and write each layer.
	for (let z = 0; z < dimensions.z; z++) {
		readSync(inputFile, layerBufferInput, 0, layerBufferInput.length, TOM_HEADER_NUM_BYTES + z * layerBufferInput.length);
		if (type === 'float32') {
			writeSync(outputFile, layerBufferInput, 0, layerBufferInput.length, TOM_HEADER_NUM_BYTES + z * layerBufferInput.length);
			continue;
		}
		// Translate layerBufferInput to layerBufferOutput.
		for (let i = 0; i < numElements * dimensions.x * dimensions.y; i++) {
			let val;
			const position = i * dataSizeForType(type)
			switch (type) {
				case 'uint8':
					val = layerBufferInput[i];
					break;
				case 'uint32':
					val = layerBufferInput.readUInt32LE(position);
					break;
				case 'int32':
					val = layerBufferInput.readInt32LE(position);
					break;
				// case 'uint16':
				// 	val = layerBufferInput.readUInt16LE(position);
				// 	break;
				// case 'int16':
				// 	val = layerBufferInput.readInt16LE(position);
				// 	break;
				default:
					throw new Error(`Error saving ${fullPath}. Unknown type ${type}.`);
			}
			layerBufferOutput.writeFloatLE(val, i * dataSizeForType('float32'));
		}
		writeSync(outputFile, layerBufferOutput, 0, layerBufferOutput.length, TOM_HEADER_NUM_BYTES + z * layerBufferOutput.length);
	}

	// Close file.
	closeSync(inputFile);
	closeSync(outputFile);
}

export function writeTomHeaderToBuffer(fullPath: string, buffer: Buffer, type: TomType, dimensions: Vector3, numElements = 1, useNull = false) {
	// Check that numElements is a valid number.
	if (numElements > MAX_NUM_ELEMENTS) {
		throw new Error(`Error saving ${fullPath}. Invalid num elements: ${numElements}.`);
	}

	// Clear buffer.
	buffer.fill(0);

	// Write dimensions of tom data to header.
	writeNumberToBuffer(fullPath, dimensions.x, 'uint16', buffer, TOM_DIMENSIONS_START_POSITION);
	writeNumberToBuffer(fullPath, dimensions.y, 'uint16', buffer, TOM_DIMENSIONS_START_POSITION + 2);
	writeNumberToBuffer(fullPath, dimensions.z, 'uint16', buffer, TOM_DIMENSIONS_START_POSITION + 4);

	// Write data type to header.
	writeStringToBuffer(fullPath, type, buffer, TOM_DATA_TYPE_START_POSITION, TOM_DATA_TYPE_NUM_BYTES);

	// Write num elements to header.
	writeStringToBuffer(fullPath, TOM_NUM_ELEMENTS_MARKER, buffer, TOM_NUM_ELEMENTS_START_POSITION, TOM_NUM_ELEMENTS_MARKER.length);
	writeNumberToBuffer(fullPath, numElements, 'uint8', buffer, TOM_NUM_ELEMENTS_START_POSITION + TOM_NUM_ELEMENTS_MARKER.length);

	// Write useNull to header.
	writeStringToBuffer(fullPath, TOM_USE_NULL_MARKER, buffer, TOM_USE_NULL_START_POSITION, TOM_USE_NULL_MARKER.length);
	writeNumberToBuffer(fullPath, useNull ? 1 : 0, 'uint8', buffer, TOM_USE_NULL_START_POSITION + TOM_USE_NULL_MARKER.length);
}

export function writeBin(path: string, filename: string, typedArray: TypedArray, numElements = 1, useNull = false, length = typedArray.length) {
	const fullPath = `${path}${filename}.bin`;

	// Open file and write header.
	let fd = writeBinHeader(path, filename, typedArray, numElements, useNull, length);
	
	// Get data type from TypedArray.
	const type = typeOfTypedArray(typedArray);
	const dataLength = dataSizeForType(type);

	// Fill remainder of buffer with data.
	const buffer = Buffer.alloc(length * dataLength);
	writeDataToBuffer(typedArray, buffer, fullPath, 0, length);
	writeSync(fd, buffer);

	// Close file.
	closeSync(fd);
}

export function writeBinHeader(path: string, filename: string, typedArray: TypedArray, numElements = 1, useNull = false, length = typedArray.length) {
	const fullPath = `${path}${filename}.bin`;

	// Check typedArray.
	if (length === 0) {
		throw new Error(`Error saving ${fullPath}. Attempting to save array of length 0.`);
	}
	if (length % numElements !== 0) {
		throw new Error(`Error saving ${fullPath}. Num elements per entry: ${numElements} not compatible with data of length ${length}.`);
	}
	if (numElements > MAX_NUM_ELEMENTS) {
		throw new Error(`Error saving ${fullPath}. Invalid num elements: ${numElements}.`);
	}

	// Get data type from TypedArray.
	const type = typeOfTypedArray(typedArray);

	// Open file.
	let fd = openSync(fullPath, 'w');

	// Write header.
	writeBinHeaderToBuffer(fullPath, binHeaderBuffer, type, length, numElements, useNull);
	writeSync(fd, binHeaderBuffer);
	
	return fd;
}

export function writeBinHeaderToBuffer(fullPath: string, buffer: Buffer, type: Type, length: number, numElements = 1, useNull = false) {
	// Check that numElements is a valid number.
	if (numElements > MAX_NUM_ELEMENTS) {
		throw new Error(`Error saving ${fullPath}. Invalid num elements: ${numElements}.`);
	}

	// Clear buffer.
	buffer.fill(0);

	// Write length to header.
	writeNumberToBuffer(fullPath, length / numElements, 'uint32', buffer, BIN_DIMENSIONS_START_POSITION);

	// Write data type to header.
	writeStringToBuffer(fullPath, type, buffer, BIN_DATA_TYPE_START_POSITION, BIN_DATA_TYPE_NUM_BYTES);

	// Write num elements to header.
	writeNumberToBuffer(fullPath, numElements, 'uint8', buffer, BIN_NUM_ELEMENTS_START_POSITION);

	// Write useNull to header.
	writeNumberToBuffer(fullPath, useNull ? 1 : 0, 'uint8', buffer, BIN_USE_NULL_START_POSITION);
}

function writeStringToBuffer(fullPath: string, type: Type | typeof TOM_NUM_ELEMENTS_MARKER | typeof TOM_USE_NULL_MARKER,
	buffer: Buffer, startPosition: number, numBytes: number) {

	const _buffer = Buffer.from(type, 'utf-8');
	if (_buffer.length > numBytes) {
		throw new Error(`Error saving ${fullPath}. Not enough bytes (${numBytes}) to store string ${type}`);
	}
	for (let i = 0; i < _buffer.length; i++) {
		buffer[startPosition + i] = _buffer[i];
	}
}

function writeNumberToBuffer(fullPath: string, number: number, type: Type, buffer: Buffer, position = 0) {
	// Write data to buffer.
	switch (type) {
		case 'uint8':
			buffer[position] = number;
			break;
		case 'uint32':
			buffer.writeUInt32LE(number, position);
			break;
		case 'int32':
			buffer.writeInt32LE(number, position);
			break;
		case 'float32':
			buffer.writeFloatLE(number, position);
			break;
		case 'uint16':
			buffer.writeUInt16LE(number, position);
			break;
		case 'int16':
			buffer.writeInt16LE(number, position);
			break;
		default:
			throw new Error(`Error saving ${fullPath}. Unknown type ${type}.`);
	}
}

export function writeDataToBuffer(typedArray: TypedArray, buffer: Buffer, fullPath?: string, startPosition = 0, length = typedArray.length) {
	// Write data to buffer.
	const type = typeOfTypedArray(typedArray);
	switch (type) {
		case 'uint8':
			for (let i = 0; i < length; i++) {
				buffer[i + startPosition] = typedArray[i];
			}
			break;
		case 'uint32':
			for (let i = 0; i < length; i++) {
				buffer.writeUInt32LE(typedArray[i], 4 * i + startPosition);
			}
			break;
		case 'int32':
			for (let i = 0; i < length; i++) {
				buffer.writeInt32LE(typedArray[i], 4 * i + startPosition);
			}
			break;
		case 'float32':
			for (let i = 0; i < length; i++) {
				buffer.writeFloatLE(typedArray[i], 4 * i + startPosition);
			}
			break;
		case 'uint16':
			for (let i = 0; i < length; i++) {
				buffer.writeUInt16LE(typedArray[i], 2 * i + startPosition);
			}
			break;
		case 'int16':
			for (let i = 0; i < length; i++) {
				buffer.writeInt16LE(typedArray[i], 2 * i + startPosition);
			}
			break;
		default:
			throw new Error(`Error saving ${fullPath}.  Unknown typed array constructor ${typedArray.constructor}.`);
	}
}


// // TODO: delete these eventually.
// export function convertVolToBin(path: string, filename: string, numElements: number, useNull: boolean, type: Type) {
// 	const fullPath = `${path}${filename}.vol`;
// 	const data = readDataAsType(fullPath, type, 0);
// 	writeBin(path, filename, data, numElements, useNull);
// }

// export function readVol(path: string, filename: string, type: Type) {
// 	const fullPath = `${path}${filename}.vol`;
// 	return readDataAsType(fullPath, type, 0);
// }