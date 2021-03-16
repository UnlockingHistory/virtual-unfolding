import GPUHelper from '../common/GPUHelper';
import { Vector3 } from 'three';
import { Axis } from '../common/types';
import { getTomDimensions } from '../common/io';

export default class Convolution1D {
	private length = 0;
	private dimensions = new Vector3();

    constructor(gpuHelper: GPUHelper) {

        // Init convolution program.
        gpuHelper.initProgram(
			'./src/segmentation/gpu/convolve1DProgram.cl',
			'convolve1D',
		);
    }
	
	setInput(path: string, filename: string, gpuHelper: GPUHelper) {
		// Init/overwrite gpu buffers.
		// Cast input to Float32Array.
		gpuHelper.createFloat32GPUBufferFromTom('input', path, filename, 'read', true);
		const inputLength = gpuHelper.lengthForGPUBuffer('input') as number;
		if (inputLength !== this.length) {
			// Modify output buffer size if needed.
            gpuHelper.createGPUBuffer('output', null, 'float*', 'write', inputLength, true);
            this.length = inputLength;
		}
		const dimensions = getTomDimensions(path, filename);
		this.dimensions.copy(dimensions);
		gpuHelper.createGPUBuffer('size', Int32Array.from(dimensions.toArray()), 'int*', 'read', 3, true);
		
        // Set arguments on convolution program.
        gpuHelper.setBufferArgument('convolve1D', 0, 'input');
		gpuHelper.setBufferArgument('convolve1D', 1, 'output');
		gpuHelper.setBufferArgument('convolve1D', 2, 'size');
	}

    convolve1D(axis: Axis, kernel: Float32Array, gpuHelper: GPUHelper, path: string, filename: string) {
        if (this.length === 0) {
            throw new Error('Set input data before running convolution.');
		}

		// Create buffers.
        gpuHelper.createGPUBuffer('convolutionKernel', Float32Array.from(kernel), 'float*', 'read', kernel.length, true);
		
		// Set arguments.
		gpuHelper.setBufferArgument('convolve1D', 3, 'convolutionKernel');
        gpuHelper.setKernelArgument('convolve1D', 4, 'int', Math.floor(kernel.length / 2));
		gpuHelper.setKernelArgument('convolve1D', 5, 'int', axis);
		
		// Run program.
		gpuHelper.runProgram('convolve1D', this.length);

		// Save to file.
        this.saveOutput(path, filename, gpuHelper);
    }

    private saveOutput(path: string, filename: string, gpuHelper: GPUHelper) {
		gpuHelper.writeTomFromGPUBuffer('output', path, filename, this.dimensions, 1, false);
    }
};