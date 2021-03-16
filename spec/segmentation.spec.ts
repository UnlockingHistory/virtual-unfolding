import * as fs from 'fs';
import clipRawData from '../src/segmentation/ClipRawData';
import Convolution1D from '../src/segmentation/Convolution1D';
import GPUHelper from '../src/common/GPUHelper';
import { makeG0Kernel, makeG1Kernel } from '../src/common/kernels';
import { Vector3 } from 'three';
import { DEVICE_NUM } from '../src/common/Defaults';
import { index3Dto1D, addDirectoryIfNeeded } from '../src/common/utils';
import { copyTom, getTomDimensions, readTom } from '../src/common/io';
import { Axis } from '../src/common/types';

const DATA_PATH = 'spec/data/letter2_curve/';
const OUTPUT_PATH = 'spec/data/temp/';

let gpuHelper: GPUHelper;
const FILENAME = 'letter2_curve';
const fileParams = {
	FILENAME,
	DIMENSIONS: getTomDimensions(DATA_PATH, FILENAME),
	DATA_PATH,
	OUTPUT_PATH,
};

describe('segmentation', () => {
	beforeAll(() => {
		// Make temp directory if needed.
		addDirectoryIfNeeded(OUTPUT_PATH);
		
		// Init gpuHelper.
		gpuHelper = new GPUHelper(DEVICE_NUM);

		// Make a copy of raw data in OUTPUT_PATH.
		copyTom(fileParams.DATA_PATH, fileParams.FILENAME, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_raw`);
	});

	beforeEach(() => {
		gpuHelper.clear();
	});

	afterEach(() => {
		gpuHelper.clear();
	});

	afterAll(() => {
		gpuHelper.destroy();

		// Delete raw file.
		fs.unlinkSync(`${fileParams.OUTPUT_PATH}${FILENAME}_raw.tom`);
	});

	it('clips raw data', () => {
		// Check errors.
		// CLIP_VAL must be a uint8.
		expect(() => clipRawData(gpuHelper, fileParams, { CLIP_VAL: 400 })).toThrow(new Error('Invalid type for compile arg CLIP_VAL: expected uint8, got 400.'));
		gpuHelper.clear();
		expect(() => clipRawData(gpuHelper, fileParams, { CLIP_VAL: -20 })).toThrow(new Error('Invalid type for compile arg CLIP_VAL: expected uint8, got -20.'));
		gpuHelper.clear();

		// Check that clipping works as expected.
		const CLIP_VAL = 20;
		clipRawData(gpuHelper, fileParams, { CLIP_VAL });
		const tomData = readTom(fileParams.DATA_PATH, FILENAME);
		const clippedData = readTom(fileParams.OUTPUT_PATH, `${FILENAME}_clipped`);
		expect(clippedData.length).toEqual(tomData.length);
		for (let i = 0; i < tomData.length; i++) {
			if (tomData[i] > CLIP_VAL) {
				expect(clippedData[i]).toEqual(CLIP_VAL);
			} else {
				expect(clippedData[i]).toEqual(tomData[i]);
			}
		}

		// Delete File.
		fs.unlinkSync(`${fileParams.OUTPUT_PATH}${FILENAME}_clipped.tom`);
	});

	it('convolves a kernel with raw data', () => {
		const convolution1D = new Convolution1D(gpuHelper);
		// Check errors.
		expect(() => convolution1D.setInput(DATA_PATH, 'bad_filename', gpuHelper)).toThrow(new Error(`ENOENT: no such file or directory, open '${DATA_PATH}bad_filename.tom'`));

		const indicesToTest = [
			// Corners.
			[0, 0, 0],
			[23, 45, 20],
			// Edges.
			[0, 23, 10],
			[23, 23, 10],
			[12, 0, 10],
			[12, 45, 10],
			[12, 23, 0],
			[12, 23, 20],
			// Middle.
			[12, 23, 10],
			[4, 35, 12],
			[17, 40, 6]
		];

		// Convolve with g0 and g1 kernels.
		const raw = readTom(DATA_PATH, FILENAME) as Uint8Array;
		convolution1D.setInput(DATA_PATH, FILENAME, gpuHelper);
		const g0Kernel = makeG0Kernel(0.7);
		convolution1D.convolve1D(Axis.X, g0Kernel, gpuHelper, OUTPUT_PATH, FILENAME + 'g0x');
		const g0xConv = readTom(OUTPUT_PATH, FILENAME + 'g0x');
		convolution1D.convolve1D(Axis.Y, g0Kernel, gpuHelper, OUTPUT_PATH, FILENAME + 'g0y');
		const g0yConv = readTom(OUTPUT_PATH, FILENAME + 'g0y');
		convolution1D.convolve1D(Axis.Z, g0Kernel, gpuHelper, OUTPUT_PATH, FILENAME + 'g0z');
		const g0zConv = readTom(OUTPUT_PATH, FILENAME + 'g0z');
		const g1Kernel = makeG1Kernel(0.7);
		convolution1D.convolve1D(Axis.X, g1Kernel, gpuHelper, OUTPUT_PATH, FILENAME + 'g1x');
		const g1xConv = readTom(OUTPUT_PATH, FILENAME + 'g1x');
		convolution1D.convolve1D(Axis.Y, g1Kernel, gpuHelper, OUTPUT_PATH, FILENAME + 'g1y');
		const g1yConv = readTom(OUTPUT_PATH, FILENAME + 'g1y');
		convolution1D.convolve1D(Axis.Z, g1Kernel, gpuHelper, OUTPUT_PATH, FILENAME + 'g1z');
		const g1zConv = readTom(OUTPUT_PATH, FILENAME + 'g1z');

		function extractStrip(data: Float32Array | Uint8Array, centerIndex3D: Vector3, axis: Axis, kernelDim: number, dimensions: Vector3) {
			const strip = [];
			for (let i = -kernelDim; i<= kernelDim; i++) {
				const offset = [0, 0, 0];
				offset[axis] = i;
				const index3D = (new Vector3().fromArray(offset)).add(centerIndex3D);
				// Clip to boundary.
				if (index3D.x < 0) index3D.x = 0;
				if (index3D.y < 0) index3D.y = 0;
				if (index3D.z < 0) index3D.z = 0;
				if (index3D.x >= dimensions.x) index3D.x = dimensions.x - 1;
				if (index3D.y >= dimensions.y) index3D.y = dimensions.y - 1;
				if (index3D.z >= dimensions.z) index3D.z = dimensions.z - 1;
				const index = index3Dto1D(index3D, dimensions);
				strip.push(data[index]);
			}
			return strip;
		}

		function convolve(kernel: Float32Array, data: number[]) {
			if (kernel.length !== data.length) {
				throw new Error('Incompatible array lengths for convolution.');
			}
			return data.map((el, i) => kernel[i] * el).reduce((sum, el) => sum + el, 0);
		}

		const dimensions = getTomDimensions(DATA_PATH, FILENAME);
		const tempVector = new Vector3();
		indicesToTest.map(index3D => {
			tempVector.fromArray(index3D);
			const xStrip = extractStrip(raw, tempVector, Axis.X, Math.floor(g0Kernel.length / 2), dimensions);
			const yStrip = extractStrip(raw, tempVector, Axis.Y, Math.floor(g0Kernel.length / 2), dimensions);
			const zStrip = extractStrip(raw, tempVector, Axis.Z, Math.floor(g0Kernel.length / 2), dimensions);
			const i = index3Dto1D(tempVector, dimensions);

			expect(g0xConv[i]).toBeCloseTo(convolve(g0Kernel, xStrip));
			expect(g0yConv[i]).toBeCloseTo(convolve(g0Kernel, yStrip));
			expect(g0zConv[i]).toBeCloseTo(convolve(g0Kernel, zStrip));

			expect(g1xConv[i]).toBeCloseTo(convolve(g1Kernel, xStrip));
			expect(g1yConv[i]).toBeCloseTo(convolve(g1Kernel, yStrip));
			expect(g1zConv[i]).toBeCloseTo(convolve(g1Kernel, zStrip));
		});

		// Delete files.
		fs.unlinkSync(`${OUTPUT_PATH}${FILENAME}g0x.tom`);
		fs.unlinkSync(`${OUTPUT_PATH}${FILENAME}g0y.tom`);
		fs.unlinkSync(`${OUTPUT_PATH}${FILENAME}g0z.tom`);
		fs.unlinkSync(`${OUTPUT_PATH}${FILENAME}g1x.tom`);
		fs.unlinkSync(`${OUTPUT_PATH}${FILENAME}g1y.tom`);
		fs.unlinkSync(`${OUTPUT_PATH}${FILENAME}g1z.tom`);
	});
});