import * as fs from 'fs';
import { getTomDimensions, readTom, getTomDataType, getTomNumElements, getTomUseNull, getBinDataType, getBinUseNull, getBinNumElements, getBinLength, readBin } from '../src/common/io';
import segmentation from '../src/segmentation/';
import { getExtension, removeExtension, addDirectoryIfNeeded } from '../src/common/utils';
import { gpuHelper } from '../src/globals/gpuHelper';

const DATA_PATH = 'spec/data/letter2_curve/';

const FILENAME = 'letter2_curve';
const fileParams = {
	FILENAME,
	DIMENSIONS: getTomDimensions(DATA_PATH, FILENAME),
	DATA_PATH,
	OUTPUT_PATH: 'spec/data/temp/letter2_curve/',
};

describe('full pipeline', () => {

	beforeAll(() => {
		// Make temp directory if needed.
		addDirectoryIfNeeded(fileParams.OUTPUT_PATH);
	});

	beforeEach(() => {
		gpuHelper.clear();
	});

	afterAll(() => {
		gpuHelper.destroy();
	});
	
	it('generates same results as prior run', () => {
		const segmentationParams = {
			CLIP_VAL: 150,
			GAUSS_KERNEL_SIGMA: 0.7,
			NORMAL_RELAX_GAUSS_SCALE: 3,
			NUM_NORMAL_RELAXATION_STEPS: 50,
			ORIENTED_BLUR_SIGMA: 0.5,
			NUM_ORIENTED_BLUR_STEPS: 1,
			NOISE_THRESHOLD: 25,
			POINT_DETECTION_MERGE_TOL: 0.5,
			EXPECTED_SINGLE_LAYER_WIDTH: 2.5,
			MAX_SINGLE_LAYER_WIDTH: 6,
			MESHING_NORMAL_ALIGNMENT_TOL: Math.PI/6,
			MESHING_EDGE_NORMAL_ORTHOG_TOL: Math.PI/6,
			MAX_EDGE_LENGTH: 1.75,
			MAX_NUM_NEIGHBORS: 10,
			MESHING_MIN_ANGLE: Math.PI/6,
			MIN_MESH_COMPONENT_SIZE: 50,
		};
		segmentation(fileParams, segmentationParams);

		const RESULT_PATH = `${DATA_PATH}results/`;
	
		// Check that all files are the same.
		fs.readdirSync(RESULT_PATH).forEach(filename => {

			const filenameNoExt = removeExtension(filename);
			const extension = getExtension(filename);

			// Files to ignore.
			if (extension === 'DS_Store') {
				return;
			}

			const fileExists = fs.existsSync(`${fileParams.OUTPUT_PATH}${filename}`);
			if (!fileExists) {
				console.log(`No file named ${filename}.`);
			}
			expect(fileExists).toBe(true);
			
			if (extension === 'tom') {
				expect(getTomDataType(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getTomDataType(RESULT_PATH, filenameNoExt));
				expect(getTomUseNull(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getTomUseNull(RESULT_PATH, filenameNoExt));
				expect(getTomNumElements(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getTomNumElements(RESULT_PATH, filenameNoExt));
				expect(getTomDimensions(fileParams.OUTPUT_PATH, filenameNoExt).equals(getTomDimensions(RESULT_PATH, filenameNoExt))).toBe(true);

				const output = readTom(fileParams.OUTPUT_PATH, filenameNoExt);
				const expected = readTom(RESULT_PATH, filenameNoExt);
				expect(output.length).toBe(expected.length);
				let match = true;
				for (let i = 0; i < expected.length; i++) {
					if (output[i] !== expected[i]) {
						match = false;
						console.log(output[i], expected[i])
						break;
					}
				}
				if (!match) {
					console.log(`No match for file: ${filename}.`);
				}
				expect(match).toBe(true);
			} else if (extension === 'bin') {
				expect(getBinDataType(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getBinDataType(RESULT_PATH, filenameNoExt));
				expect(getBinUseNull(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getBinUseNull(RESULT_PATH, filenameNoExt));
				expect(getBinNumElements(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getBinNumElements(RESULT_PATH, filenameNoExt));
				expect(getBinLength(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getBinLength(RESULT_PATH, filenameNoExt));

				const output = readBin(fileParams.OUTPUT_PATH, filenameNoExt);
				const expected = readBin(RESULT_PATH, filenameNoExt);
				expect(output.length).toBe(expected.length);
				let match = true;
				for (let i = 0; i < expected.length; i++) {
					if (output[i] !== expected[i]) {
						match = false;
						break;
					}
				}
				if (!match) {
					console.log(`No match for file: ${filename}.`);
				}
				expect(match).toBe(true);
			} else {
				throw new Error(`Unknown extension ${extension}.`);
			}
		});

		fs.readdirSync(fileParams.OUTPUT_PATH).forEach(filename => {
			fs.unlinkSync(fileParams.OUTPUT_PATH + filename);
		});
		fs.rmdirSync(fileParams.OUTPUT_PATH);
	});
});

