import GPUHelper from '../common/GPUHelper';
import { performance } from 'perf_hooks';
import { FileParams } from '../common/types';
import { logTime } from '../common/utils';

export default function run(
	gpuHelper: GPUHelper,
	fileParams: FileParams,
	params: Readonly<{
		CLIP_VAL: number
	}>,
) {
	const startTime = performance.now();

	const {
		CLIP_VAL
	} = params;

    gpuHelper.initProgram(
		'./src/segmentation/gpu/clipProgram.cl',
		'clip',
		{
			CLIP_VAL: {
				value: CLIP_VAL,
				type: 'uint8',
			},
		},
	);

	// Constants.
	const NUM_VOXELS = fileParams.DIMENSIONS.x * fileParams.DIMENSIONS.y * fileParams.DIMENSIONS.z;

	// Init gpu buffers.
	gpuHelper.createGPUBufferFromTom('raw', fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_raw`, 'read');
    gpuHelper.createGPUBuffer('clipped', null, 'uchar*', 'write', NUM_VOXELS);

    // Set arguments.
    gpuHelper.setBufferArgument('clip', 0, 'raw');
    gpuHelper.setBufferArgument('clip', 1, 'clipped');

    // Run.
    gpuHelper.runProgram('clip', NUM_VOXELS);

    // Save.
    gpuHelper.writeTomFromGPUBuffer('clipped', fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_clipped`, fileParams.DIMENSIONS);

    gpuHelper.clear();

	logTime('\tclip raw data', startTime);
};