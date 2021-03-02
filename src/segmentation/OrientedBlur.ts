import GPUHelper from '../common/GPUHelper';
import { performance } from 'perf_hooks';
import { BufferedTomDataR } from '../common/BufferedTomDataR';
import { FileParams, GPUTypedArray } from '../common/types';
import { makeG0Kernel } from '../common/kernels';
import { log, logTime } from '../common/utils';

export default function run(
	gpuHelper: GPUHelper,
	fileParams: FileParams,
	params: Readonly<{
		NUM_ORIENTED_BLUR_STEPS: number,
		ORIENTED_BLUR_SIGMA: number,
	}>,
) {
	const startTime = performance.now();
	
	// Constants.
	const {
		NUM_ORIENTED_BLUR_STEPS,
		ORIENTED_BLUR_SIGMA,
	} = params;
    const LAYER_LENGTH = fileParams.DIMENSIONS.x * fileParams.DIMENSIONS.y;

	// Load up inputs.
	const normals = new BufferedTomDataR(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_normalsRelaxed', 0);
	const blurKernel = makeG0Kernel(ORIENTED_BLUR_SIGMA);
	const BLUR_KERNEL_DIM = Math.floor(blurKernel.length/2);

    // Init gpu program.
    gpuHelper.initProgram(
		'./src/segmentation/gpu/orientedBlurProgram.cl',
		'orientedBlur',
		{
			BLUR_KERNEL_DIM: {
				value: BLUR_KERNEL_DIM,
				type: 'uint32',
			},
		});

    // Load raw data.
	gpuHelper.createFloat32GPUBufferFromTom('input', fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_raw`, 'read');
	// Create buffers.
    gpuHelper.createGPUBuffer('output', null, 'float*', 'readwrite', fileParams.DIMENSIONS.x * fileParams.DIMENSIONS.y * fileParams.DIMENSIONS.z);
    gpuHelper.createGPUBuffer('size', Int32Array.from(fileParams.DIMENSIONS.toArray()), 'int*', 'read', 3);
	gpuHelper.createGPUBuffer('convolutionKernel', blurKernel, 'float*', 'read');
	gpuHelper.createGPUBuffer('normals', null, 'float*', 'read', LAYER_LENGTH * 3);

	// Set kernel arguments.
    gpuHelper.setBufferArgument('orientedBlur', 0, 'input');
	gpuHelper.setBufferArgument('orientedBlur', 1, 'output');
	gpuHelper.setBufferArgument('orientedBlur', 2, 'normals');
    gpuHelper.setBufferArgument('orientedBlur', 3, 'size');
    gpuHelper.setBufferArgument('orientedBlur', 4, 'convolutionKernel');

	// Run on each layer (can't load all normals at once).
    for (let i = 0; i < NUM_ORIENTED_BLUR_STEPS; i++) {
        log(`\t    blur iter: ${i}`);
        for (let z = 0; z < fileParams.DIMENSIONS.z; z++) {
            gpuHelper.copyDataToGPUBuffer('normals', normals.getData(z) as GPUTypedArray);
			gpuHelper.setKernelArgument('orientedBlur', 5, 'int', z);
            gpuHelper.runProgram('orientedBlur', LAYER_LENGTH);
        }

        // Flip input and output.
        if (i % 2 === 0) {
            gpuHelper.setBufferArgument('orientedBlur', 1, 'input');
			gpuHelper.setBufferArgument('orientedBlur', 0, 'output');
        } else {
            gpuHelper.setBufferArgument('orientedBlur', 0, 'input');
			gpuHelper.setBufferArgument('orientedBlur', 1, 'output');
        }
    }

    // Save output data.
    gpuHelper.writeTomFromGPUBuffer(NUM_ORIENTED_BLUR_STEPS % 2 ? 'output' : 'input', fileParams.OUTPUT_PATH, fileParams.FILENAME + '_blurred', fileParams.DIMENSIONS);

	// Close open files.
	normals.close();
	
	// Clear.
	gpuHelper.clear();

    logTime('\toriented blur', startTime);
};