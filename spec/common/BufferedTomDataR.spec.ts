import BufferedTomDataR from '../../src/common/BufferedTomDataR';
import { Vector3 } from 'three';
import * as fs from 'fs';
import { BUFFER_WINDOW_SIZE } from '../../src/common/Defaults';
import { typeOfTypedArray, index1Dto3D, addDirectoryIfNeeded } from '../../src/common/utils'
import { writeTom } from '../../src/common/io';

const OUTPUT_PATH = 'spec/data/temp/';
const DATA_LENGTH = 3000;
const DIM1 = new Vector3(10, 10, 30);
const DIM3 = new Vector3(10, 10, 10);
const FILENAME = 'TomReadFile';

const float32Data = new Float32Array(DATA_LENGTH);
const int32Data = new Int32Array(DATA_LENGTH);
const uint32Data = new Uint32Array(DATA_LENGTH);
const uint8Data = new Uint8Array(DATA_LENGTH);
const arrays = [
	float32Data,
	int32Data,
	uint32Data,
	uint8Data,
];
arrays.forEach(array => {
	const type = typeOfTypedArray(array);
	switch(type) {
		case 'uint8':
			for (let i = 0; i < DATA_LENGTH; i++) {
				array[i] = i % 256;
			}
			break;
		case 'float32':
			for (let i = 0; i < DATA_LENGTH; i++) {
				array[i] = i + 0.5 - DATA_LENGTH/2;
			}
			break;
		case 'uint32':
			for (let i = 0; i < DATA_LENGTH; i++) {
				array[i] = i;
			}
			break;
		case 'int32':
			for (let i = 0; i < DATA_LENGTH; i++) {
				array[i] = i - DATA_LENGTH/2;
			}
			break;
	}
});

describe('BufferedTomDataR', function() {

	beforeAll(() => {
		// Make temp directory if needed.
		addDirectoryIfNeeded(OUTPUT_PATH);

		// Write tom files.
		arrays.forEach(array => {
			// Save tom files.
			const type = typeOfTypedArray(array);
			const name = `${FILENAME}_${type}_1el`;
			writeTom(OUTPUT_PATH, name, array, DIM1);
			expect(fs.existsSync(`${OUTPUT_PATH}${name}.tom`)).toBe(true);
		});

		arrays.forEach(array => {
			// Save tom files.
			const type = typeOfTypedArray(array);
			const name = `${FILENAME}_${type}_3el`;
			writeTom(OUTPUT_PATH, name, array, DIM3, 3);
			expect(fs.existsSync(`${OUTPUT_PATH}${name}.tom`)).toBe(true);
		});
	});

	afterAll(() => {
		// Delete File.
		arrays.forEach(array => {
			const type = typeOfTypedArray(array);
			fs.unlinkSync(`${OUTPUT_PATH}${FILENAME}_${type}_1el.tom`);
		});
		arrays.forEach(array => {
			const type = typeOfTypedArray(array);
			fs.unlinkSync(`${OUTPUT_PATH}${FILENAME}_${type}_3el.tom`);
		});
	});

	it('throws errors for invalid lookups', () => {
		const tomBuffer = new BufferedTomDataR(OUTPUT_PATH, `${FILENAME}_uint8_1el`);
		const DIM1_BUFFER = new Vector3().copy(DIM1);
		DIM1_BUFFER.z = BUFFER_WINDOW_SIZE * 2 + 1;

		// Check errors.
		const center = (new Vector3()).copy(DIM1).divideScalar(2).floor();
        expect( () => { tomBuffer.get(-2, center.y, center.z) } ).toThrow();
        expect( () => { tomBuffer.get(DIM1.x, center.y, center.z) } ).toThrow();
        expect( () => { tomBuffer.get(center.x, -5, center.z) } ).toThrow();
        expect( () => { tomBuffer.get(center.x, DIM1.y, center.z) } ).toThrow();
        expect( () => { tomBuffer.get(center.x, center.y, -12) } ).toThrow();
		expect( () => { tomBuffer.get(center.x, center.y, DIM1.z) } ).toThrow();		
	});

    it('reads data', () => {
		arrays.forEach(array => {
			const type = typeOfTypedArray(array);
			const name = `${FILENAME}_${type}_1el`;
			const buffer = new BufferedTomDataR(OUTPUT_PATH, name);

			// Test that all values are read in correctly.
			const tempVec3 = new Vector3();
			for (let i = 0; i < DATA_LENGTH; i++) {
				const index3D = index1Dto3D(i, DIM1, tempVec3);
				expect(buffer.get(index3D.x, index3D.y, index3D.z)).toEqual(array[i]);
			}

			buffer.close();
		});

		// Try again with diff window size.
		arrays.forEach(array => {
			const type = typeOfTypedArray(array);
			const name = `${FILENAME}_${type}_1el`;
			const buffer = new BufferedTomDataR(OUTPUT_PATH, name, 1);

			// Test that all values are read in correctly.
			const tempVec3 = new Vector3();
			for (let i = 0; i < DATA_LENGTH; i++) {
				const index3D = index1Dto3D(i, DIM1, tempVec3);
				expect(buffer.get(index3D.x, index3D.y, index3D.z)).toEqual(array[i]);
			}

			buffer.close();
		});

		// Test with num elements per voxel > 1.
		arrays.forEach(array => {
			const type = typeOfTypedArray(array);
			const name = `${FILENAME}_${type}_3el`;
			const buffer = new BufferedTomDataR(OUTPUT_PATH, name);

			// Test that all values are read in correctly.
			const tempVec3 = new Vector3();
			const temp: number[] = [];
			for (let i = 0; i < DATA_LENGTH / 3; i++) {
				const index3D = index1Dto3D(i, DIM3, tempVec3);
				expect(buffer.get(index3D.x, index3D.y, index3D.z, temp)).toEqual([array[3*i], array[3*i+1], array[3*i+2]]);
			}

			buffer.close();
		});

		// Test with num elements per voxel > 1.  Try again with diff window size.
		arrays.forEach(array => {
			const type = typeOfTypedArray(array);
			const name = `${FILENAME}_${type}_3el`;
			const buffer = new BufferedTomDataR(OUTPUT_PATH, name, 1);

			// Test that all values are read in correctly.
			const temp: number[] = [];
			const tempVec3 = new Vector3();
			for (let i = 0; i < DATA_LENGTH / 3; i++) {
				const index3D = index1Dto3D(i, DIM3, tempVec3);
				expect(buffer.get(index3D.x, index3D.y, index3D.z, temp)).toEqual([array[3*i], array[3*i+1], array[3*i+2]]);
			}

			buffer.close();
		});
    });

    it('getVector3', () => {
		// Check errors.
		expect( () => { new BufferedTomDataR(OUTPUT_PATH, `${FILENAME}_uint8_1el`).getVector3(0, 0, 0, new Vector3()) })
			.toThrow(new Error('Must be exactly three elements per voxel to call getVector3().'));

		arrays.forEach(array => {
			const type = typeOfTypedArray(array);
			const name = `${FILENAME}_${type}_3el`;
			const buffer = new BufferedTomDataR(OUTPUT_PATH, name);

			// Test that all values are read in correctly.
			const temp = new Vector3();
			const tempVec3 = new Vector3();
			for (let i = 0; i < DATA_LENGTH / 3; i++) {
				const index3D = index1Dto3D(i, DIM3, tempVec3);
				expect(buffer.getVector3(index3D.x, index3D.y, index3D.z, temp)!.equals(new Vector3(array[3*i], array[3*i+1], array[3*i+2]))).toBe(true);
			}

			buffer.close();
		});

		// Try again with diff window size.
		arrays.forEach(array => {
			const type = typeOfTypedArray(array);
			const name = `${FILENAME}_${type}_3el`;
			const buffer = new BufferedTomDataR(OUTPUT_PATH, name, 1);

			// Test that all values are read in correctly.
			const temp = new Vector3();
			const tempVec3 = new Vector3();
			for (let i = 0; i < DATA_LENGTH / 3; i++) {
				const index3D = index1Dto3D(i, DIM3, tempVec3);
				expect(buffer.getVector3(index3D.x, index3D.y, index3D.z, temp)!.equals(new Vector3(array[3*i], array[3*i+1], array[3*i+2]))).toBe(true);
			}

			buffer.close();
		});
	});
	
	it('manually sets center Z', () => {
		const WINDOW_SIZE = 2;
		arrays.forEach(array => {
			const type = typeOfTypedArray(array);
			const name = `${FILENAME}_${type}_3el`;
			const buffer = new BufferedTomDataR(OUTPUT_PATH, name, WINDOW_SIZE);
			
			for (let z = -WINDOW_SIZE; z < DIM3.z + WINDOW_SIZE; z++) {
				buffer.manuallySetBufferCenterZ(z);
				// Test that we fill the appropriate elements with zeros.
				const data = buffer.getData();
				expect(data.length).toEqual((2 * WINDOW_SIZE + 1) * DIM3.x * DIM3.y * 3);
				for (let i = 0; i < data.length; i++) {
					const i_offset = i + (z - WINDOW_SIZE) * DIM3.x * DIM3.y * 3;
					if (i_offset < 0) {
						expect(data[i]).toEqual(0);
					} else if (i_offset >= DIM3.x * DIM3.y * DIM3.z * 3) {
						expect(data[i]).toEqual(0);
					} else {
						expect(data[i]).toEqual(array[i_offset]);
					}
				}
			}

			buffer.close();
		});
	});
});