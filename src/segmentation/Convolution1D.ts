import GPUHelper from '../common/GPUHelper';
import { Vector3 } from 'three';
import { Axis, GPUTypedArray } from '../common/types';
import { getTomDimensions } from '../common/io';
import { BufferedTomDataW } from '../common/BufferedTomDataW';
import { BufferedTomDataR } from '../common/BufferedTomDataR';

export default class Convolution1D {
	private dimensions = new Vector3();
	private input?: BufferedTomDataR;

    constructor(gpuHelper: GPUHelper) {

        // Init convolution program.
        gpuHelper.initProgram(
			'./src/segmentation/gpu/convolve1DProgram.cl',
			'convolve1D',
		);
    }
	
	setInput(path: string, filename: string, gpuHelper: GPUHelper, KERNEL_LENGTH: number) {
		// Open buffered TOM data (the input may be too large to fit into memory at once).
		const WINDOW_SIZE =  Math.floor(KERNEL_LENGTH / 2) + 1;
		this.input = new BufferedTomDataR(path, filename, WINDOW_SIZE);

		// Init/overwrite gpu buffers.
		const dimensions = getTomDimensions(path, filename);
		this.dimensions.copy(dimensions);
		gpuHelper.createGPUBuffer('size', Int32Array.from(dimensions.toArray()), 'int*', 'read', 3, true);
	
		// Cast input to Float32Array.
		gpuHelper.createGPUBuffer('input', null, 'float*', 'read', dimensions.x * dimensions.y * WINDOW_SIZE, true);

		// Modify output buffer size if needed.
		gpuHelper.createGPUBuffer('output', null, 'float*', 'write', dimensions.x * dimensions.y, true);
		
        // Set arguments on convolution program.
        gpuHelper.setBufferArgument('convolve1D', 0, 'input');
		gpuHelper.setBufferArgument('convolve1D', 1, 'output');
		gpuHelper.setBufferArgument('convolve1D', 2, 'size');
	}

	convolve1D(axis: Axis, kernel: Float32Array, gpuHelper: GPUHelper, path: string, filename: string) {
        if (!this.input) {
            throw new Error('Set input data before running convolution.');
		}

		// Create buffers.
        gpuHelper.createGPUBuffer('convolutionKernel', Float32Array.from(kernel), 'float*', 'read', kernel.length, true);
		
		// Set arguments.
		gpuHelper.setBufferArgument('convolve1D', 3, 'convolutionKernel');
        gpuHelper.setKernelArgument('convolve1D', 4, 'int', Math.floor(kernel.length / 2));
		gpuHelper.setKernelArgument('convolve1D', 5, 'int', axis);

		// Init an output file.
		const output = new BufferedTomDataW(path, filename, 'float32', this.dimensions);

		// Cast as float32 if needed - init a buffer for this.
		let float32Array;
		if (this.input.type !== 'float32') {
			float32Array = new Float32Array(this.input.getData(0).length);
		}

		// Loop over all z-layers
		const LAYER_LENGTH = this.dimensions.x * this.dimensions.y;
		for (let z = 0; z < this.dimensions.z; z++) {
			// Set z layer.
			gpuHelper.setKernelArgument('convolve1D', 6, 'int', z);
			gpuHelper.setKernelArgument('convolve1D', 7, 'int', z * LAYER_LENGTH - this.input.windowSize * LAYER_LENGTH);

			// Load data.
			const data = this.input.getData(z);
			if (float32Array) {
				// Cast as float32 if needed.
				for (let i = 0; i < data.length; i++) {
					float32Array[i] = data[i];
				}
				gpuHelper.copyDataToGPUBuffer('input', float32Array);
			} else {
				gpuHelper.copyDataToGPUBuffer('input', data as GPUTypedArray);
			}

			// Run program.
			gpuHelper.runProgram('convolve1D', LAYER_LENGTH);
	
			// Save results.
			gpuHelper.copyDataFromGPUBuffer('output', output.getData() as GPUTypedArray);
			output.writeLayer(z);
		}

		// Close file.
        output.close();
    }

	close() {
		this.input?.close();
	}
};