import GPUHelper from '../common/GPUHelper';
import { performance } from 'perf_hooks';
import { BufferedTomDataR } from '../common/BufferedTomDataR';
import { FileParams, GPUTypedArray } from '../common/types';
import { makeG0Kernel } from '../common/kernels';
import { log, logTime } from '../common/utils';
import { BufferedTomDataRW } from '../common/BufferedTomDataRW';
import { copyTomAsFloat32 } from '../common/io';
import { unlinkSync } from 'fs';

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
	const BLUR_KERNEL_DIM = Math.floor(blurKernel.length / 2);

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

	// Init space for output, we will toggle between output 1 and output 2.
	copyTomAsFloat32(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_raw', fileParams.OUTPUT_PATH, fileParams.FILENAME + '_blurredTemp1');
	copyTomAsFloat32(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_raw', fileParams.OUTPUT_PATH, fileParams.FILENAME + '_blurredTemp2');
	const DATA_BUFFER_KERNEL_SIZE = BLUR_KERNEL_DIM + 2;
	const output1 = new BufferedTomDataRW(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_blurredTemp1', DATA_BUFFER_KERNEL_SIZE);
	const output2 = new BufferedTomDataRW(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_blurredTemp2', DATA_BUFFER_KERNEL_SIZE);
	let input = output1;
	let output = output2;
	gpuHelper.createGPUBuffer('input', null, 'float*', 'read', input.getData(0).length, true);
	gpuHelper.createGPUBuffer('output', null, 'float*', 'read', LAYER_LENGTH, true);
	// Create buffers.
    gpuHelper.createGPUBuffer('size', new Int32Array([fileParams.DIMENSIONS.x, fileParams.DIMENSIONS.y, 2 * DATA_BUFFER_KERNEL_SIZE + 1]), 'int*', 'read', 3);
	gpuHelper.createGPUBuffer('convolutionKernel', blurKernel, 'float*', 'read');
	gpuHelper.createGPUBuffer('normals', null, 'float*', 'read', LAYER_LENGTH * 3);

	// Set kernel arguments.
    gpuHelper.setBufferArgument('orientedBlur', 0, 'input');
	gpuHelper.setBufferArgument('orientedBlur', 1, 'output');
	gpuHelper.setBufferArgument('orientedBlur', 2, 'normals');
    gpuHelper.setBufferArgument('orientedBlur', 3, 'size');
    gpuHelper.setBufferArgument('orientedBlur', 4, 'convolutionKernel');
	gpuHelper.setKernelArgument('orientedBlur', 5, 'int', DATA_BUFFER_KERNEL_SIZE);

	// Run on each layer (can't load all normals at once).
	const tempArray1 = new Float32Array(LAYER_LENGTH);
    for (let i = 0; i < NUM_ORIENTED_BLUR_STEPS; i++) {
        log(`\t    blur iter: ${i}`);
        for (let z = 0; z < fileParams.DIMENSIONS.z; z++) {
			gpuHelper.copyDataToGPUBuffer('input', input.getData(z) as GPUTypedArray);
            gpuHelper.copyDataToGPUBuffer('normals', normals.getData(z) as GPUTypedArray);
            gpuHelper.runProgram('orientedBlur', LAYER_LENGTH);
			// Save output to file.
			gpuHelper.copyDataFromGPUBuffer('output', tempArray1);
			output.setLayer(z, tempArray1);
        }

        // Flip input and output.
        if (i % 2 === 0) {
			input = output2;
			output = output1;
        } else {
			input = output1;
			output = output2;
        }
    }

    // Save output data.
	input.close();
	output.close();
    copyTomAsFloat32(fileParams.OUTPUT_PATH, fileParams.FILENAME + (NUM_ORIENTED_BLUR_STEPS % 2 ? '_blurredTemp2' : '_blurredTemp1'), fileParams.OUTPUT_PATH, fileParams.FILENAME + '_blurred');
	// Delete temp files.
	unlinkSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_blurredTemp1.tom`);
	unlinkSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_blurredTemp2.tom`);

	// Close open files.
	normals.close();
	
	// Clear.
	gpuHelper.clear();

    logTime('\toriented blur', startTime);
};