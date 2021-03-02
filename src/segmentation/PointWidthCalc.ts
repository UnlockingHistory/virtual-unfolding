import GPUHelper from '../common/GPUHelper';
import { performance } from 'perf_hooks';
import  { BufferedTomDataR } from '../common/BufferedTomDataR';
import { logTime} from '../common/utils';
import { FileParams } from '../common/types';
import { makeG1Kernel, makeG2Kernel } from '../common/kernels';
import { BufferedTomDataW } from '../common/BufferedTomDataW';

export default function run(
	gpuHelper: GPUHelper,
	fileParams: FileParams,
	params: Readonly<{
		MAX_SINGLE_LAYER_WIDTH: number,
		NOISE_THRESHOLD: number,
		GAUSS_KERNEL_SIGMA: number,
	}>,
) {
	const startTime = performance.now();
	
	// TODO: remove pointsWidth from second gpu program.

	// Constants.
	let {
		MAX_SINGLE_LAYER_WIDTH,
		NOISE_THRESHOLD,
		GAUSS_KERNEL_SIGMA,
	} = params;
	// Load kernels.
	const g1 = makeG1Kernel(GAUSS_KERNEL_SIGMA);
	const g2 = makeG2Kernel(GAUSS_KERNEL_SIGMA);
	const LAYER_LENGTH = fileParams.DIMENSIONS.x * fileParams.DIMENSIONS.y;
	const KERNEL_DIM = Math.floor(g1.length / 2);
	const INDICES_WINDOW_SIZE = MAX_SINGLE_LAYER_WIDTH;
	const STRIP_DIM = Math.ceil(MAX_SINGLE_LAYER_WIDTH * 2);

    // Init gpu program.
    gpuHelper.initProgram(
		'./src/segmentation/gpu/widthCalcProgram.cl',
		'widthCalc',
		{
			STRIP_DIM: {
				value: STRIP_DIM,
				type: 'uint32',
			},
			STRIP_LENGTH: {
				value: 2 * STRIP_DIM + 1,
				type: 'uint32',
			},
			KERNEL_DIM: {
				value: KERNEL_DIM,
				type: 'uint32',
			},
			NOISE_THRESHOLD: {
				value: NOISE_THRESHOLD,
				type: 'uint8',
			},
			INDICES_WINDOW_SIZE: {
				value: INDICES_WINDOW_SIZE,
				type: 'uint8',
			},
			RESPONSE_CUTOFF: {
				value: 10,
				type: 'float32',
			},
			TAPER_SLOPE: {
				value: 40,
				type: 'float32',
			},
		});

    // Init files for saving output data.
	const allWidthsMin = new BufferedTomDataW(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allWidthsMin', 'float32', fileParams.DIMENSIONS, 1, true);
	const allWidthsMax = new BufferedTomDataW(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allWidthsMax', 'float32', fileParams.DIMENSIONS, 1, true);

	// Load previously computed data.
	const allIndices = new BufferedTomDataR(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allIndices', INDICES_WINDOW_SIZE);

	// Set kernel buffers.
	gpuHelper.createGPUBufferFromBin('points', fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allPointsList', 'read');
    gpuHelper.createGPUBufferFromBin('normals', fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allNormalsList', 'read');
    gpuHelper.createFloat32GPUBufferFromTom('data', fileParams.OUTPUT_PATH, fileParams.FILENAME + '_blurred', 'read');
    gpuHelper.createGPUBuffer('size', Int32Array.from(fileParams.DIMENSIONS.toArray()), 'int*', 'read');
	gpuHelper.createGPUBuffer('firstDerivKernel', g1, 'float*', 'read');
	gpuHelper.createGPUBuffer('secondDerivKernel', g2, 'float*', 'read');
	gpuHelper.createGPUBuffer('bounds', null, 'float*', 'write', LAYER_LENGTH * 2);
	gpuHelper.createGPUBuffer('indices', null, 'int*', 'read', allIndices.getArraySize());

	// Set kernel arguments.
	gpuHelper.setBufferArgument('widthCalc', 0, 'bounds');
    gpuHelper.setBufferArgument('widthCalc', 1, 'points');
	gpuHelper.setBufferArgument('widthCalc', 2, 'normals');
	gpuHelper.setBufferArgument('widthCalc', 3, 'data');
	gpuHelper.setBufferArgument('widthCalc', 4, 'size');
    gpuHelper.setBufferArgument('widthCalc', 5, 'firstDerivKernel');
    gpuHelper.setBufferArgument('widthCalc', 6, 'secondDerivKernel');
    gpuHelper.setBufferArgument('widthCalc', 7, 'indices');

	// Temp arrays for copying data.
	const allWidthsMinData = allWidthsMin.getData();
	const allWidthsMaxData = allWidthsMax.getData();
	const tempArray2x = new Float32Array(2 * LAYER_LENGTH);

    for (let z = 0; z < fileParams.DIMENSIONS.z; z++) {
		// Init output as null.
		gpuHelper.setBufferValue('bounds', null);

		// Set arguments.
		gpuHelper.setKernelArgument('widthCalc', 8, 'int', z);

        // Load indices data.
        gpuHelper.copyDataToGPUBuffer('indices', allIndices.getData(z) as Int32Array);

        // Run.
        gpuHelper.runProgram('widthCalc', LAYER_LENGTH);

        // Get data off GPU.
        gpuHelper.copyDataFromGPUBuffer('bounds', tempArray2x);
		for (let i = 0; i < LAYER_LENGTH; i++) {
			if (isNaN(tempArray2x[2*i]) || isNaN(tempArray2x[2*i+1])) {
				console.log(z, tempArray2x[2*i], tempArray2x[2*i + 1]);
			}
			allWidthsMinData[i] = tempArray2x[2*i];
			allWidthsMaxData[i] = tempArray2x[2*i + 1];
		}
		allWidthsMin.writeLayer(z);
		allWidthsMax.writeLayer(z);
	}
	
	// Save and close all files.
	allWidthsMin.close();
	allWidthsMax.close();
	allIndices.close();

	gpuHelper.clear();
	
    logTime('\tpoints width calc', startTime);
};