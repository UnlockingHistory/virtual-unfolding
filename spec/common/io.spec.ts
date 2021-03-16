// import { Vector3 } from 'three';
// import * as fs from 'fs';
// import { typeOfTypedArray, stringifyVector3, addDirectoryIfNeeded } from '../../src/common/utils';
// import { writeTom, readTom, getTomDataType, getTomDimensions, getTomNumElements, getTomUseNull, writeBin, readBin, getBinDataType, getBinLength, getBinNumElements, getBinUseNull } from '../../src/common/io';

// const TEMP_PATH = 'spec/data/temp/';
// const DATA_LENGTH = 1000;
// const float32Data = new Float32Array(DATA_LENGTH);
// const int32Data = new Int32Array(DATA_LENGTH);
// const uint32Data = new Uint32Array(DATA_LENGTH);
// const uint8Data = new Uint8Array(DATA_LENGTH);
// const arrays = [
// 	float32Data,
// 	int32Data,
// 	uint32Data,
// 	uint8Data,
// ];
// arrays.forEach(array => {
// 	const type = typeOfTypedArray(array);
// 	switch(type) {
// 		case 'uint8':
// 			for (let i = 0; i < DATA_LENGTH; i++) {
// 				array[i] = i % 256;
// 			}
// 			break;
// 		case 'float32':
// 			for (let i = 0; i < DATA_LENGTH; i++) {
// 				array[i] = i + 0.5 - DATA_LENGTH/2;
// 			}
// 			break;
// 		case 'uint32':
// 			for (let i = 0; i < DATA_LENGTH; i++) {
// 				array[i] = i;
// 			}
// 			break;
// 		case 'int32':
// 			for (let i = 0; i < DATA_LENGTH; i++) {
// 				array[i] = i - DATA_LENGTH/2;
// 			}
// 			break;
// 	}
// });

// describe('io', () => {

// 	beforeAll(() => {
// 		// Make temp directory if needed.
// 		addDirectoryIfNeeded(TEMP_PATH);
// 	});

// 	it('writes and reads a .tom file', () => {
// 		const DIM1 = new Vector3(20, 5, 10);
// 		const FILENAME = 'tomFile';

// 		// Check errors.
// 		expect(() => writeTom(TEMP_PATH, FILENAME, new Uint8Array(0), DIM1)).toThrow(new Error(`Error saving ${TEMP_PATH}${FILENAME}.tom. Attempting to save array of length 0.`));
// 		expect(() => writeTom(TEMP_PATH, FILENAME, new Uint8Array([1, 2, 3, 4, 5]), DIM1)).toThrow(new Error(`Error saving ${TEMP_PATH}${FILENAME}.tom. Dimensions ${stringifyVector3(DIM1)}, num elements per voxel: 1 not compatible with data of length ${5}.`));
// 		expect(() => writeTom(TEMP_PATH, FILENAME, uint8Data, new Vector3(2, 1, 1), 500)).toThrow(new Error(`Error saving ${TEMP_PATH}${FILENAME}.tom. Invalid num elements: ${500}.`));
		
// 		arrays.forEach(array => {
// 			// Save tom files.
// 			const type = typeOfTypedArray(array);
// 			const name = `${FILENAME}_${type}`;
// 			writeTom(TEMP_PATH, name, array, DIM1);
// 			expect(fs.existsSync(`${TEMP_PATH}${name}.tom`)).toBe(true);

// 			// Read data back in.
// 			const data = readTom(TEMP_PATH, name);
// 			// Check that correct type is returned.
// 			expect(data.constructor).toEqual(array.constructor);
// 			expect(getTomDataType(TEMP_PATH, name)).toEqual(type);
// 			// Check that dimensions are correct.
// 			expect(getTomDimensions(TEMP_PATH, name).equals(DIM1)).toBe(true);
// 			// Check that num elements is 1.
// 			expect(getTomNumElements(TEMP_PATH, name)).toEqual(1);
// 			// Check that use null is false.
// 			expect(getTomUseNull(TEMP_PATH, name)).toBe(false);
// 			// Check that values written are correct.
// 			for (let i = 0; i < DATA_LENGTH; i++) {
// 				expect(data[i]).toEqual(array[i]);
// 			}

// 			// Delete File.
// 			fs.unlinkSync(`${TEMP_PATH}${name}.tom`);
// 		});

// 		// Try again setting useNull = true, and numElements != 1.
// 		arrays.forEach(array => {
// 			const DIM2 = new Vector3(10, 5, 10);
// 			const NUM_ELEMENTS = 2;

// 			// Save tom files.
// 			const type = typeOfTypedArray(array);
// 			const name = `${FILENAME}_${type}_${NUM_ELEMENTS}`;
// 			writeTom(TEMP_PATH, name, array, DIM2, NUM_ELEMENTS, true);
// 			expect(fs.existsSync(`${TEMP_PATH}${name}.tom`)).toBe(true);

// 			// Read data back in.
// 			const data = readTom(TEMP_PATH, name);
// 			// Check that correct type is returned.
// 			expect(data.constructor).toEqual(array.constructor);
// 			expect(getTomDataType(TEMP_PATH, name)).toEqual(type);
// 			// Check that dimensions are correct.
// 			expect(getTomDimensions(TEMP_PATH, name).equals(DIM2)).toBe(true);
// 			// Check that num elements is 1.
// 			expect(getTomNumElements(TEMP_PATH, name)).toEqual(NUM_ELEMENTS);
// 			// Check that use null is false.
// 			expect(getTomUseNull(TEMP_PATH, name)).toBe(true);
// 			// Check that values written are correct.
// 			for (let i = 0; i < DATA_LENGTH; i++) {
// 				expect(data[i]).toEqual(array[i]);
// 			}

// 			// Delete File.
// 			fs.unlinkSync(`${TEMP_PATH}${name}.tom`);
// 		});
// 	});

// 	it('writes and reads a .bin file', () => {
// 		const FILENAME = 'binFile';

// 		// Check errors.
// 		expect(() => writeBin(TEMP_PATH, 'uint8', new Uint8Array(0))).toThrow(new Error(`Error saving ${TEMP_PATH}uint8.bin. Attempting to save array of length 0.`));
// 		expect(() => writeBin(TEMP_PATH, 'uint8', uint8Data, 500)).toThrow(new Error(`Error saving ${TEMP_PATH}uint8.bin. Invalid num elements: ${500}.`));

// 		arrays.forEach(array => {
// 			// Save bin files.
// 			const type = typeOfTypedArray(array);
// 			const name = `${FILENAME}_${type}`;
// 			writeBin(TEMP_PATH, name, array);
// 			expect(fs.existsSync(`${TEMP_PATH}${name}.bin`)).toBe(true);

// 			// Read data back in.
// 			const data = readBin(TEMP_PATH, name);
// 			// Check that correct type is returned.
// 			expect(data.constructor).toEqual(array.constructor);
// 			expect(getBinDataType(TEMP_PATH, name)).toEqual(type);
// 			// Check that dimensions are correct.
// 			expect(getBinLength(TEMP_PATH, name)).toEqual(DATA_LENGTH);
// 			// Check that num elements is 1.
// 			expect(getBinNumElements(TEMP_PATH, name)).toEqual(1);
// 			// Check that use null is false.
// 			expect(getBinUseNull(TEMP_PATH, name)).toBe(false);
// 			// Check that values written are correct.
// 			for (let i = 0; i < DATA_LENGTH; i++) {
// 				expect(data[i]).toEqual(array[i]);
// 			}

// 			// Delete File.
// 			fs.unlinkSync(`${TEMP_PATH}${name}.bin`);
// 		});

// 		// Try again setting useNull = true, and numElements != 1.
// 		arrays.forEach(array => {
// 			const NUM_ELEMENTS = 2;

// 			// Save tom files.
// 			const type = typeOfTypedArray(array);
// 			const name = `${FILENAME}_${type}_${NUM_ELEMENTS}`;
// 			writeBin(TEMP_PATH, name, array, NUM_ELEMENTS, true);
// 			expect(fs.existsSync(`${TEMP_PATH}${name}.bin`)).toBe(true);

// 			// Read data back in.
// 			const data = readBin(TEMP_PATH, name);
// 			// Check that correct type is returned.
// 			expect(data.constructor).toEqual(array.constructor);
// 			expect(getBinDataType(TEMP_PATH, name)).toEqual(type);
// 			// Check that dimensions are correct.
// 			expect(getBinLength(TEMP_PATH, name)).toBe(DATA_LENGTH / NUM_ELEMENTS);
// 			// Check that num elements is 1.
// 			expect(getBinNumElements(TEMP_PATH, name)).toEqual(NUM_ELEMENTS);
// 			// Check that use null is false.
// 			expect(getBinUseNull(TEMP_PATH, name)).toBe(true);
// 			// Check that values written are correct.
// 			for (let i = 0; i < DATA_LENGTH; i++) {
// 				expect(data[i]).toEqual(array[i]);
// 			}

// 			// Delete File.
// 			fs.unlinkSync(`${TEMP_PATH}${name}.bin`);
// 		});
// 	});
// });