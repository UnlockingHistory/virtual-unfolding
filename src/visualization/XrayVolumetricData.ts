import GPUHelper from '../common/GPUHelper';
import { performance } from 'perf_hooks';
import { getRuntimeParams, logTime, stringifyVector3 } from '../common/utils';
import { saveBMP } from '../common/BmpWriter';
import { DEVICE_NUM } from '../common/Defaults';
import { Vector3 } from 'three';

type Params = {
	FILENAME: string,
	DIMENSIONS: Vector3,
	DATA_PATH: string,
	OUTPUT_PATH: string,
}

function flattenTomAlongX(gpuHelper: GPUHelper, params: Params, opacity: number) {
	const startTime = performance.now();

    gpuHelper.initProgram('./src/visualization/gpu/flattenUchar.cl', 'flattenAlongX');

	// Get width and height.
	const width = params.DIMENSIONS.y;
	const height = params.DIMENSIONS.z;

    // Init gpu buffers.
    gpuHelper.createGPUBufferFromTom('input', params.DATA_PATH, params.FILENAME, 'read');
	gpuHelper.createGPUBuffer('output', null, 'uchar*', 'write', width * height);
	gpuHelper.createGPUBuffer('size', Int32Array.from(params.DIMENSIONS.toArray()), 'int*', 'read', 3);

    // Set arguments.
    gpuHelper.setBufferArgument('flattenAlongX', 0, 'input');
    gpuHelper.setBufferArgument('flattenAlongX', 1, 'output');
	gpuHelper.setKernelArgument('flattenAlongX', 2, 'float', opacity);
	gpuHelper.setBufferArgument('flattenAlongX', 3, 'size');

    // Run.
    gpuHelper.runProgram('flattenAlongX', width * height);

	// Save.
	const output = new Uint8Array(width * height);
    gpuHelper.copyDataFromGPUBuffer('output', output);
	saveBMP(params.OUTPUT_PATH, params.FILENAME + '_xray_X', output, width, height, 1);

    gpuHelper.clear();

	logTime('\tflatten tom data along x', startTime);
}

function flattenTomAlongY(gpuHelper: GPUHelper, params: Params, opacity: number) {
	const startTime = performance.now();

    gpuHelper.initProgram('./src/visualization/gpu/flattenUchar.cl', 'flattenAlongY');

	// Get width and height.
	const width = params.DIMENSIONS.x;
	const height = params.DIMENSIONS.z;

	// Init gpu buffers.
	gpuHelper.createGPUBufferFromTom('input', params.DATA_PATH, params.FILENAME, 'read');
	gpuHelper.createGPUBuffer('output', null, 'uchar*', 'write', width * height);
	gpuHelper.createGPUBuffer('size', Int32Array.from(params.DIMENSIONS.toArray()), 'int*', 'read', 3);

    // Set arguments.
    gpuHelper.setBufferArgument('flattenAlongY', 0, 'input');
    gpuHelper.setBufferArgument('flattenAlongY', 1, 'output');
	gpuHelper.setKernelArgument('flattenAlongY', 2, 'float', opacity);
	gpuHelper.setBufferArgument('flattenAlongY', 3, 'size');

    // Run.
    gpuHelper.runProgram('flattenAlongY', width * height);

	// Save.
	const output = new Uint8Array(width * height);
    gpuHelper.copyDataFromGPUBuffer('output', output);
	saveBMP(params.OUTPUT_PATH, params.FILENAME + '_xray_Y', output, width, height, 1);

    gpuHelper.clear();

	logTime('\tflatten tom data along y', startTime);
}

function flattenTomAlongZ(gpuHelper: GPUHelper, params: Params, opacity: number) {
	const startTime = performance.now();

    gpuHelper.initProgram('./src/visualization/gpu/flattenUchar.cl', 'flattenAlongZ');

	// Get width and height.
	const width = params.DIMENSIONS.x;
	const height = params.DIMENSIONS.y;

	// Init gpu buffers.
	gpuHelper.createGPUBufferFromTom('input', params.DATA_PATH, params.FILENAME, 'read');
	gpuHelper.createGPUBuffer('output', null, 'uchar*', 'write', width * height);
	gpuHelper.createGPUBuffer('size', Int32Array.from(params.DIMENSIONS.toArray()), 'int*', 'read', 3);

    // Set arguments.
    gpuHelper.setBufferArgument('flattenAlongZ', 0, 'input');
    gpuHelper.setBufferArgument('flattenAlongZ', 1, 'output');
	gpuHelper.setKernelArgument('flattenAlongZ', 2, 'float', opacity);
	gpuHelper.setBufferArgument('flattenAlongZ', 3, 'size');

    // Run.
    gpuHelper.runProgram('flattenAlongZ', width * height);

	// Save.
	const output = new Uint8Array(width * height);
    gpuHelper.copyDataFromGPUBuffer('output', output);
	saveBMP(params.OUTPUT_PATH, params.FILENAME + '_xray_Z', output, width, height, 1);

    gpuHelper.clear();

	logTime('\tflatten tom data along z', startTime);
}

const params = getRuntimeParams();

const AXIS = process.env.AXIS ? process.env.AXIS : 'y';
console.log(`Flattening along axis: ${AXIS}.`);

// Get opacity.
const OPACITY = process.env.OPACITY ? parseFloat(process.env.OPACITY) : 0.05;
if (Number.isNaN(OPACITY)) {
	throw new Error(`Invalid opacity: ${OPACITY}, expected float.`);
}
console.log(`Blend opacity: ${OPACITY}.`);

// Init gpuHelper.
const gpuHelper = new GPUHelper(process.env.DEVICE_NUM ? parseInt(process.env.DEVICE_NUM) : DEVICE_NUM);

switch(AXIS.toLowerCase()) {
	case 'x':
		flattenTomAlongX(gpuHelper, params, OPACITY);
		break;
	case 'y':
		flattenTomAlongY(gpuHelper, params, OPACITY);
		break;
	case 'z':
		flattenTomAlongZ(gpuHelper, params, OPACITY);
		break;
	default:
		throw new Error(`Invalid flattening axis: ${AXIS}, expected ['x', 'y', 'z'].`);
}

