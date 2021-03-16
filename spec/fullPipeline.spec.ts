
// import * as fs from 'fs';
// import GPUHelper from '../src/common/GPUHelper';
// import { getTomDimensions, readTom, getTomDataType, getTomNumElements, getTomUseNull, getBinDataType, getBinUseNull, getBinNumElements, getBinLength, readBin } from '../src/common/io';
// import segmentation from '../src/segmentation/main';
// import { getExtension, removeExtension, addDirectoryIfNeeded } from '../src/common/utils';

// const DATA_PATH = 'spec/data/letter2_curve/';

// let gpuHelper: GPUHelper;
// const FILENAME = 'letter2_curve';
// const fileParams = {
// 	FILENAME,
// 	DIMENSIONS: getTomDimensions(DATA_PATH, FILENAME),
// 	DATA_PATH,
// 	OUTPUT_PATH: 'spec/data/temp/letter2_curve/',
// };

// const DEVICE_NUM = 1;

// describe('full pipeline', () => {

// 	beforeAll(() => {
// 		// Make temp directory if needed.
// 		addDirectoryIfNeeded(fileParams.OUTPUT_PATH);
// 		// Init gpuHelper.
// 		gpuHelper = new GPUHelper(DEVICE_NUM);
// 	});

// 	beforeEach(() => {
// 		gpuHelper.clear();
// 	});

// 	afterAll(() => {
// 		gpuHelper.destroy();
// 	});

// 	it('generates same results as prior run', () => {
// 		const segmentationParams = {
// 			CLIP_VAL: 150,
// 			GAUSS_KERNEL_SIGMA: 0.7,
// 			NORMAL_RELAX_GAUSS_SCALE: 3,
// 			NUM_NORMAL_RELAXATION_STEPS: 50,
// 			ORIENTED_BLUR_SIGMA: 0.5,
// 			NUM_ORIENTED_BLUR_STEPS: 1,
// 			NOISE_THRESHOLD: 25,
// 			POINT_DETECTION_MERGE_TOL: 0.5,
// 			EXPECTED_SINGLE_LAYER_WIDTH: 2.5,
// 			MAX_SINGLE_LAYER_WIDTH: 6,
// 		};
// 		segmentation(gpuHelper, fileParams, segmentationParams);

// 		const RESULT_PATH = `${DATA_PATH}results/`;
	
// 		// Check that all files are the same.
// 		fs.readdirSync(RESULT_PATH).forEach(filename => {

// 			const filenameNoExt = removeExtension(filename);
// 			const extension = getExtension(filename);

// 			// Files to ignore.
// 			if (extension === 'DS_Store') {
// 				return;
// 			}

// 			const fileExists = fs.existsSync(`${fileParams.OUTPUT_PATH}${filename}`);
// 			if (!fileExists) {
// 				console.log(`No file named ${filename}.`);
// 			}
// 			expect(fileExists).toBe(true);
			
// 			if (extension === 'tom') {
// 				expect(getTomDataType(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getTomDataType(RESULT_PATH, filenameNoExt));
// 				expect(getTomUseNull(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getTomUseNull(RESULT_PATH, filenameNoExt));
// 				expect(getTomNumElements(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getTomNumElements(RESULT_PATH, filenameNoExt));
// 				expect(getTomDimensions(fileParams.OUTPUT_PATH, filenameNoExt).equals(getTomDimensions(RESULT_PATH, filenameNoExt))).toBe(true);

// 				const output = readTom(fileParams.OUTPUT_PATH, filenameNoExt);
// 				const expected = readTom(RESULT_PATH, filenameNoExt);
// 				expect(output.length).toBe(expected.length);
// 				let match = true;
// 				for (let i = 0; i < expected.length; i++) {
// 					if (output[i] !== expected[i]) {
// 						match = false;
// 						console.log(output[i], expected[i])
// 						break;
// 					}
// 				}
// 				if (!match) {
// 					console.log(`No match for file: ${filename}.`);
// 				}
// 				expect(match).toBe(true);
// 			} else if (extension === 'bin') {
// 				expect(getBinDataType(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getBinDataType(RESULT_PATH, filenameNoExt));
// 				expect(getBinUseNull(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getBinUseNull(RESULT_PATH, filenameNoExt));
// 				expect(getBinNumElements(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getBinNumElements(RESULT_PATH, filenameNoExt));
// 				expect(getBinLength(fileParams.OUTPUT_PATH, filenameNoExt)).toEqual(getBinLength(RESULT_PATH, filenameNoExt));

// 				const output = readBin(fileParams.OUTPUT_PATH, filenameNoExt);
// 				const expected = readBin(RESULT_PATH, filenameNoExt);
// 				expect(output.length).toBe(expected.length);
// 				let match = true;
// 				for (let i = 0; i < expected.length; i++) {
// 					if (output[i] !== expected[i]) {
// 						match = false;
// 						break;
// 					}
// 				}
// 				if (!match) {
// 					console.log(`No match for file: ${filename}.`);
// 				}
// 				expect(match).toBe(true);
// 			} else {
// 				throw new Error(`Unknown extension ${extension}.`);
// 			}
// 		});

// 		fs.readdirSync(fileParams.OUTPUT_PATH).forEach(filename => {
// 			fs.unlinkSync(fileParams.OUTPUT_PATH + filename);
// 		});
// 		fs.rmdirSync(fileParams.OUTPUT_PATH);
// 	});
// });

